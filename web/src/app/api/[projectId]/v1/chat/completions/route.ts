import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Langfuse } from "langfuse";
import { prisma } from "../../../../../../../../packages/shared/src/db";
import { NextResponse } from "next/server";
import {
  createShaHash,
  verifySecretKey,
} from "../../../../../../../../packages/shared/src/server/auth/apiKeys";

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

  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { publicKey },
    include: { project: true },
  });

  if (!apiKeyRecord) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  console.log("SecretKey", secretKey);
  // Hash the provided secret key using Langfuse's standard method
  const hashedSecretKey = createShaHash(secretKey, process.env.SALT);
  console.log("hashedSecretKey", hashedSecretKey);
  console.log(
    "apiKeyRecord.fastHashedSecretKey",
    apiKeyRecord.fastHashedSecretKey,
  );
  // Compare with stored fast hashed secret key
  if (hashedSecretKey !== apiKeyRecord.fastHashedSecretKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Initialize Langfuse with projectId from path parameter
  const langfuse = new Langfuse({
    publicKey: "9b3cf6b62ac64a3ab1f9332623b841a1",
    secretKey: "27b0bb1282434147909f74b395b99228",
    baseUrl: "http://localhost:3000",
    _projectId: params.projectId,
  });

  // Declare trace and requestSpan at function scope
  const trace = langfuse.trace({
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
    // Add CORS headers
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");

    // Handle OPTIONS request for CORS preflight
    if (request.method === "OPTIONS") {
      return NextResponse.json(null, {
        headers: Object.fromEntries(headers),
        status: 200,
      });
    }

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
    const api = new OpenAI({
      apiKey: "sk-24b0ef07b7ff4832bd505f177dac6a77",
      baseURL: "https://api.deepseek.com",
    });

    if (stream) {
      // Create span for streaming
      const streamingSpan = trace.span({
        name: "streaming-response",
      });

      // Handle streaming response
      const responseStream = await api.chat.completions.create({
        model: "deepseek-chat",
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
            streamingGeneration.end({
              output: completionText,
              usage: {
                promptTokens: Math.floor(usage.prompt_tokens),
                completionTokens: Math.floor(usage.completion_tokens),
                totalTokens: Math.floor(usage.total_tokens),
              },
              costDetails: {
                inputCost: (usage.prompt_tokens * 0.0015) / 1000,
                outputCost: (usage.completion_tokens * 0.002) / 1000,
                totalCost: (usage.total_tokens * 0.0015) / 1000,
              },
              metadata: {
                cost: {
                  input: (usage.prompt_tokens * 0.0015) / 1000,
                  output: (usage.completion_tokens * 0.002) / 1000,
                  total: (usage.total_tokens * 0.0015) / 1000,
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
          ...Object.fromEntries(headers),
        },
      });
    } else {
      // Handle non-streaming response
      // Create span for non-streaming response
      const completionSpan = trace.span({
        name: "completion-response",
      });

      const response = await api.chat.completions.create({
        model: "deepseek-chat",
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
        completionGeneration.end({
          output: response.choices[0]?.message?.content || "",
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0,
          },
          metadata: {
            cost: {
              input: ((response.usage?.prompt_tokens || 0) * 0.0015) / 1000,
              output: ((response.usage?.completion_tokens || 0) * 0.002) / 1000,
              total: ((response.usage?.total_tokens || 0) * 0.0015) / 1000,
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

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  } finally {
    // End the request span
    requestSpan.end();
  }
}
