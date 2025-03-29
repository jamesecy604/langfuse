import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Langfuse } from "langfuse";
import { prisma } from "../../../../../../../../packages/shared/src/db";
import { decrypt } from "../../../../../../../../packages/shared/src/encryption";
import { Decimal } from "@prisma/client/runtime/library";
import { NextResponse } from "next/server";
import {
  createShaHash,
  verifySecretKey,
} from "../../../../../../../../packages/shared/src/server/auth/apiKeys";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";
import { BalanceService } from "../../../../../../../../packages/shared/src/server/services/balanceService";
import { TokenUsageService } from "../../../../../../../../packages/shared/src/server/services/tokenUsageService";

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } },
) {
  if (!process.env.SALT) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No bearer in header" }, { status: 401 });
  }

  const apiKeyValue = authHeader.substring(7);

  const keyParts = apiKeyValue.split("-");
  if (keyParts.length !== 3) {
    return NextResponse.json(
      {
        error:
          "Invalid API key format - must be in format sk-<publicKey>-<secretKey>",
      },
      { status: 401 },
    );
  }

  const publicKey = keyParts[1];
  const secretKey = keyParts[2];

  // Find key by public key

  // Hash the provided secret key using Langfuse's standard method
  const hashFromProvidedKey = createShaHash(secretKey, process.env.SALT);
  const apiKeyRecord = await new ApiAuthService(
    prisma,
    redis,
  ).fetchUserApiKeyAndAddToRedis(hashFromProvidedKey);
  // Compare with stored fast hashed secret key
  if (
    !apiKeyRecord?.userId ||
    hashFromProvidedKey !== apiKeyRecord?.fastHashedSecretKey
  ) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Initialize BalanceService
  const balanceService = new BalanceService();
  const tokenUsageService = new TokenUsageService();

  // Check user balance before proceeding
  const balance = await balanceService.getCurrentBalance(apiKeyRecord.userId);
  if (balance === null || balance <= 0) {
    return NextResponse.json(
      { error: "User balance limit reached" },
      { status: 402 },
    );
  }

  if (apiKeyRecord.projectId !== params.projectId) {
    return NextResponse.json(
      { error: "You are not authorized to the project by the api key." },
      { status: 401 },
    );
  }

  // Initialize Langfuse with projectId from path parameter
  const langfuse = new Langfuse({
    publicKey: publicKey,
    secretKey: secretKey,
    baseUrl: "http://localhost:3000",
    _projectId: params.projectId,
  });

  // Declare trace and requestSpan at function scope
  const trace = langfuse.trace({
    userId: apiKeyRecord.userId,
    name: "chat-completion",
    metadata: {
      method: request.method,
      url: request.url,
    },
  });

  // Create span for the full request
  const requestSpan = trace.span({
    name: "request-handling",
  });

  try {
    const body = await request.json();
    trace.update({
      input: body,
    });
    if (!body || !body.model || !body.messages) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    const { model, messages, temperature, stream } = body;

    // Initialize OpenAI API
    // Get model configuration
    const modelConfig = await prisma.model.findFirst({
      where: {
        projectId: params.projectId,
        modelName: body.model,
      },
      include: {
        Price: {
          where: {
            usageType: {
              in: ["input", "output"],
            },
          },
        },
      },
    });

    if (!modelConfig) {
      return NextResponse.json(
        { error: `Model configuration not found for ${body.model}` },
        { status: 404 },
      );
    }

    // Get LLM API credentials for the project
    if (!modelConfig.projectId) {
      return NextResponse.json(
        {
          error: `Model configuration has no associated project`,
        },
        { status: 404 },
      );
    }

    // Get all LLM API keys for the project
    const llmApiKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId: modelConfig.projectId,
      },
      select: {
        id: true,
        secretKey: true,
        provider: true,
        adapter: true,
        customModels: true,
        withDefaultModels: true,
        baseURL: true,
      },
    });

    // Filter keys that support the requested model
    const supportedKeys = llmApiKeys.filter((key) => {
      // Check if model is in custom models
      if (key.customModels.includes(model)) {
        return true;
      }

      // // Check if provider supports model by default
      // if (key.withDefaultModels) {
      //   // TODO: Implement provider-specific model validation
      //   // For now assume all default models are supported
      //   return true;
      // }

      return false;
    });

    if (!supportedKeys.length) {
      return NextResponse.json(
        {
          error: `LLM API credentials not configured for project ${params.projectId}`,
        },
        { status: 404 },
      );
    }

    // Choose API key with least usage
    const llmApiKeyId = await tokenUsageService.chooseLLMApiKeyId(
      supportedKeys.map((k) => k.id),
    );
    console.log("===============================choosed", llmApiKeyId);
    if (!llmApiKeyId) {
      return NextResponse.json(
        { error: "Failed to select API key" },
        { status: 500 },
      );
    }

    const llmConfig = llmApiKeys.find((k) => k.id === llmApiKeyId);

    if (!llmConfig) {
      return NextResponse.json(
        {
          error: `LLM API credentials not configured for project ${params.projectId}`,
        },
        { status: 404 },
      );
    }

    // Decrypt the API key
    const decryptedKey = await decrypt(llmConfig.secretKey);
    if (!decryptedKey) {
      return NextResponse.json(
        { error: "Failed to decrypt API key" },
        { status: 500 },
      );
    }

    const api = new OpenAI({
      apiKey: decryptedKey,
      baseURL: llmConfig.baseURL,
    });

    if (stream) {
      // Create span for streaming
      const streamingSpan = trace.span({
        name: "streaming-response",
      });

      // Handle streaming response
      const responseStream = await api.chat.completions.create({
        model: model,
        messages,
        temperature: temperature ?? 0.7,
        stream: true,
      });

      // Create generation for streaming
      const streamingGeneration = trace.generation({
        name: "streaming-completion",
        input: messages,
        model: model,
        metadata: {
          stream: true,
        },
      });

      // Track token usage
      let promptTokens = 0;
      let completionTokens = 0;
      let completionText = "";
      let usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      // Convert to ReadableStream
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of responseStream) {
              const content = chunk.choices[0]?.delta?.content || "";
              completionText += content;
              completionTokens += content.length / 4; // Approximate token count

              // Accumulate usage from chunks if available
              if (chunk.usage) {
                usage.prompt_tokens =
                  chunk.usage.prompt_tokens || usage.prompt_tokens;
                usage.completion_tokens =
                  chunk.usage.completion_tokens || usage.completion_tokens;
                usage.total_tokens =
                  chunk.usage.total_tokens || usage.total_tokens;
              }

              controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            controller.close();

            // End generation with final output using accumulated usage
            const inputPrice = modelConfig.Price?.find(
              (p) => p.usageType === "input",
            )?.price
              ? Number(
                  modelConfig.Price.find((p) => p.usageType === "input")?.price,
                )
              : 0;
            const outputPrice = modelConfig.Price?.find(
              (p) => p.usageType === "output",
            )?.price
              ? Number(
                  modelConfig.Price.find((p) => p.usageType === "output")
                    ?.price,
                )
              : 0;

            const costDetail = {
              inputCost: parseFloat(
                ((usage.prompt_tokens * inputPrice) / 1000).toFixed(6),
              ),
              outputCost: parseFloat(
                ((usage.completion_tokens * outputPrice) / 1000).toFixed(6),
              ),
            };
            // Update balance with the calculated cost
            await balanceService.updateBalance(
              apiKeyRecord.userId!,
              costDetail.inputCost + costDetail.outputCost,
              "DEBIT",
              `Chat completion tokens for model ${model}`,
            );

            //update tokenUsage with calculated total tokens and total cost
            await tokenUsageService.updateTokenUsage(
              llmApiKeyId,
              usage.total_tokens,
              costDetail.inputCost + costDetail.outputCost,
              "",
            );

            streamingGeneration.end({
              output: completionText,
              usage: {
                promptTokens: Math.floor(usage.prompt_tokens),
                completionTokens: Math.floor(usage.completion_tokens),
                totalTokens: Math.floor(usage.total_tokens),
              },
              costDetails: {
                input: costDetail.inputCost,
                output: costDetail.outputCost,
                total: costDetail.inputCost + costDetail.outputCost,
              },
              metadata: {
                cost: {
                  input: costDetail.inputCost,
                  output: costDetail.outputCost,
                  total: parseFloat(
                    (costDetail.inputCost + costDetail.outputCost).toFixed(6),
                  ),
                },
              },
            });
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            streamingGeneration.update({
              level: "ERROR",
              statusMessage: errorMessage,
            });
            console.error("Stream error:", error);
            controller.error(error);
          }
        },
      });

      return new NextResponse(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      // Handle non-streaming response
      // Create span for non-streaming response
      const completionSpan = trace.span({
        name: "completion-response",
      });

      const response = await api.chat.completions.create({
        model: model,
        messages,
        temperature: temperature ?? 0.7,
        stream: false,
      });

      // Validate response structure
      if (
        !response?.choices?.length ||
        !response.choices[0]?.message?.content
      ) {
        console.error("Invalid API response:", response);
        // Create generation for completion
        const completionGeneration = trace.generation({
          name: "completion",
          input: messages,
          model: model,
          metadata: {
            stream: false,
          },
        });

        // Track completion response with full details
        const inputPrice = modelConfig.Price?.find(
          (p) => p.usageType === "input",
        )?.price
          ? Number(
              modelConfig.Price.find((p) => p.usageType === "input")?.price,
            )
          : 0;
        const outputPrice = modelConfig.Price?.find(
          (p) => p.usageType === "output",
        )?.price
          ? Number(
              modelConfig.Price.find((p) => p.usageType === "output")?.price,
            )
          : 0;

        const costDetail = {
          inputCost:
            Math.round(
              (((response.usage?.prompt_tokens || 0) * inputPrice) / 1000) *
                1000000,
            ) / 1000000,
          outputCost:
            Math.round(
              (((response.usage?.completion_tokens || 0) * outputPrice) /
                1000) *
                1000000,
            ) / 1000000,
        };
        // Update balance with the calculated cost
        await balanceService.updateBalance(
          apiKeyRecord.userId!,
          -(costDetail.inputCost + costDetail.outputCost),
          "DEBIT",
          `Chat completion tokens for model ${model}`,
        );

        completionGeneration.end({
          output: response.choices[0]?.message?.content || "",
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0,
          },
          costDetails: {
            input: costDetail.inputCost,
            output: costDetail.outputCost,
            total: costDetail.inputCost + costDetail.outputCost,
          },
          metadata: {
            cost: {
              input: costDetail.inputCost,
              output: costDetail.outputCost,
              total: costDetail.inputCost + costDetail.outputCost,
            },
          },
        });

        return NextResponse.json(
          {
            error: "Invalid response from AI provider",
            details: "No assistant message content received",
          },
          { status: 500 },
        );
      }

      // Return OpenAI-compatible response
      return NextResponse.json(
        {
          ...response,
          choices: response.choices.map((choice) => ({
            ...choice,
            message: {
              ...choice.message,
              content: choice.message.content || "",
            },
          })),
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error("Error:", error);
    // Track error in trace
    trace.update({
      metadata: {
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
    });

    // Handle OpenAI API errors specifically
    if (
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number"
    ) {
      return NextResponse.json(
        {
          error: error.message,
          code: "code" in error ? error.code : undefined,
          type: "type" in error ? error.type : undefined,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  } finally {
    // End the request span
    requestSpan.end();
  }
}
