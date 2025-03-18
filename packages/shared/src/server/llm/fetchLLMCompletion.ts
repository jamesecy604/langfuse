import type { ZodSchema } from "zod";

import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import {
  BytesOutputParser,
  StringOutputParser,
} from "@langchain/core/output_parsers";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { ChatOpenAI } from "@langchain/openai";
import { processEventBatch } from "../ingestion/processEventBatch";
import { logger } from "../logger";
import {
  ChatMessage,
  ChatMessageRole,
  LLMAdapter,
  ModelParams,
  TraceParams,
} from "./types";
import { CallbackHandler } from "langfuse-langchain";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";

type ProcessTracedEvents = () => Promise<void>;

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  structuredOutputSchema?: ZodSchema;
  callbacks?: BaseCallbackHandler[];
  baseURL?: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
  maxRetries?: number;
  config?: Record<string, string> | null;
  traceParams?: TraceParams;
  throwOnError?: boolean; // default is true
};

type FetchLLMCompletionParams = LLMCompletionParams & {
  streaming: boolean;
};

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: true;
  },
): Promise<{
  completion: IterableReadableStream<Uint8Array>;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
  },
): Promise<{ completion: string; processTracedEvents: ProcessTracedEvents }>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
    structuredOutputSchema: ZodSchema;
  },
): Promise<{
  completion: unknown;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  params: FetchLLMCompletionParams,
): Promise<{
  completion: string | IterableReadableStream<Uint8Array> | unknown;
  processTracedEvents: ProcessTracedEvents;
}> {
  // the apiKey must never be printed to the console
  const {
    messages,
    modelParams,
    streaming,
    callbacks,
    apiKey,
    baseURL,
    maxRetries,
    config,
    traceParams,
    extraHeaders,
    throwOnError = true,
  } = params;

  let finalCallbacks: BaseCallbackHandler[] | undefined = callbacks ?? [];
  let processTracedEvents: ProcessTracedEvents = () => Promise.resolve();

  if (traceParams) {
    const handler = new CallbackHandler({
      publicKey: "pk-lf-e510259e-b4cc-4589-907a-24ddbb655a93",
      secretKey: "sk-lf-bd202eec-b06c-4b41-8bf2-26a9014b79b2",
      baseUrl: "http://localhost:3000",
      _projectId: traceParams.projectId,
      _isLocalEventExportEnabled: true,
      tags: traceParams.tags,
    });
    finalCallbacks.push(handler);

    processTracedEvents = async () => {
      try {
        const events = await handler.langfuse._exportLocalEvents(
          traceParams.projectId,
        );
        const generationCreateEvent = events.find(
          (event) => event.type === "generation-create",
        );
        if (generationCreateEvent) {
          const response = await chatModel.invoke(finalMessages, runConfig);
          const generation = {
            text: response.content || "",
            generationInfo: response.response_metadata,
          };

          const usage = {
            input: generation.generationInfo?.usage?.prompt_tokens || 0,
            output: generation.generationInfo?.usage?.completion_tokens || 0,
            total: generation.generationInfo?.usage?.total_tokens || 0,
            inputCost:
              ((generation.generationInfo?.usage?.prompt_tokens || 0) *
                0.0015) /
              1000,
            outputCost:
              ((generation.generationInfo?.usage?.completion_tokens || 0) *
                0.002) /
              1000,
            totalCost:
              ((generation.generationInfo?.usage?.total_tokens || 0) * 0.0015) /
              1000,
          };

          // Ensure cost data is properly included in the event
          const eventBody = {
            ...generationCreateEvent.body,
            usage: usage,
            costDetails: {
              inputTokens: usage.input,
              outputTokens: usage.output,
              inputCost: usage.inputCost,
              outputCost: usage.outputCost,
            },
            total_cost: usage.totalCost,
            output: response.content || "",
            metadata: {
              ...(generationCreateEvent.body.metadata || {}),
              cost: usage.totalCost,
            },
          };

          // Replace the body with our complete version
          generationCreateEvent.body = eventBody;

          console.log(
            "Generation metadata with usage:",
            generationCreateEvent.body.metadata,
          );
          console.log("Generation usage:", generationCreateEvent.body.usage);
        }
        console.log("modified events", JSON.parse(JSON.stringify(events)));
        // let new_events = [];
        // new_events.push(testevent);
        //console.log("modified events", JSON.parse(JSON.stringify(new_events)));
        await processEventBatch(
          JSON.parse(JSON.stringify(events)), // stringify to emulate network event batch from network call
          traceParams.authCheck,
        );
        // await processEventBatch(
        //   JSON.parse(JSON.stringify(new_events)), // stringify to emulate network event batch from network call
        //   traceParams.authCheck,
        // );
      } catch (e) {
        logger.error("Failed to process traced events", { error: e });
      }
    };
  }

  finalCallbacks = finalCallbacks.length > 0 ? finalCallbacks : undefined;

  let finalMessages: BaseMessage[];
  // VertexAI requires at least 1 user message
  if (modelParams.adapter === LLMAdapter.VertexAI && messages.length === 1) {
    finalMessages = [new HumanMessage(messages[0].content)];
  } else {
    finalMessages = messages.map((message) => {
      if (message.role === ChatMessageRole.User)
        return new HumanMessage(message.content);
      if (
        message.role === ChatMessageRole.System ||
        message.role === ChatMessageRole.Developer
      )
        return new SystemMessage(message.content);

      return new AIMessage(message.content);
    });
  }

  finalMessages = finalMessages.filter((m) => m.content.length > 0);

  let chatModel: ChatOpenAI;

  if (modelParams.adapter === LLMAdapter.OpenAI) {
    chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      streamUsage: false, // https://github.com/langchain-ai/langchainjs/issues/6533
      maxRetries,
      configuration: {
        baseURL,
        defaultHeaders: extraHeaders,
      },
      timeout: 1000 * 60 * 2, // 2 minutes timeout
    });
  } else {
    // eslint-disable-next-line no-unused-vars
    throw new Error("This model provider is not supported.");
  }

  const runConfig = {
    callbacks: finalCallbacks,
    runId: traceParams?.traceId,
    runName: traceParams?.traceName,
  };

  try {
    if (params.structuredOutputSchema) {
      return {
        completion: await (chatModel as ChatOpenAI) // Typecast necessary due to https://github.com/langchain-ai/langchainjs/issues/6795
          .withStructuredOutput(params.structuredOutputSchema)
          .invoke(finalMessages, runConfig),
        processTracedEvents,
      };
    }

    if (streaming) {
      return {
        completion: await chatModel
          .pipe(new BytesOutputParser())
          .stream(finalMessages, runConfig),
        processTracedEvents,
      };
    }

    return {
      completion: await chatModel
        .pipe(new StringOutputParser())
        .invoke(finalMessages, runConfig),
      processTracedEvents,
    };
  } catch (error) {
    if (throwOnError) {
      throw error;
    }
    return { completion: null, processTracedEvents };
  }
}
