import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Langfuse } from "langfuse";

// Initialize Langfuse
const langfuse = new Langfuse({
  publicKey: "pk-lf-e510259e-b4cc-4589-907a-24ddbb655a93",
  secretKey: "sk-lf-bd202eec-b06c-4b41-8bf2-26a9014b79b2",
  baseUrl: "http://localhost:3000",
  _projectId: "cm88onipo000euvlssrisywh9",
});

export async function POST(req: NextRequest) {
  // Declare trace and requestSpan at function scope
  const trace = langfuse.trace({
    name: "chat-completion",
    metadata: {
      method: req.method,
      url: req.url,
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
    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const body = await req.json();
    trace.update({
      input: body,
    });

    if (!body || !body.model || !body.messages) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400, headers },
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

      return new Response(readableStream, {
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
          { status: 500, headers },
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
        { headers },
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
