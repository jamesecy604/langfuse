import { StreamingTextResponse } from "ai";
import { NextResponse, type NextRequest } from "next/server";
import { type Model } from "../../../../../../packages/shared/src/db";
import { type ChatMessage } from "../../../../../../packages/shared";

import {
  BaseError,
  InternalServerError,
  InvalidRequestError,
} from "../../../../../../packages/shared";

import { PosthogCallbackHandler } from "./analytics/posthogCallback";
import { authorizeRequestOrThrow } from "./authorizeRequest";
import { validateChatCompletionBody } from "./validateChatCompletionBody";

import { prisma } from "../../../../../../packages/shared/src/db";
import { decrypt } from "../../../../../../packages/shared/src/encryption";
import {
  LLMApiKeySchema,
  logger,
  fetchLLMCompletion,
  decryptAndParseExtraHeaders,
} from "../../../../../../packages/shared/src/server";
import { fetch } from "next/dist/compiled/@edge-runtime/primitives";
//import { formatClickhouseUTCDateTime } from "../../../../../../packages/shared/src/server/utils/formatClickhouseUTCDateTime";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { jsonSchema } from "@langfuse/shared";
import { instrumentSync, processEventBatch } from "@langfuse/shared/src/server";
import { telemetry } from "@/src/features/telemetry";

export default async function chatCompletionHandler(req: NextRequest) {
  try {
    const body = validateChatCompletionBody(await req.json());

    const { userId } = await authorizeRequestOrThrow(body.projectId);
    const { messages, modelParams } = body;

    const LLMApiKey = await prisma.llmApiKeys.findFirst({
      where: {
        projectId: body.projectId,
        provider: modelParams.provider,
      },
    });

    if (!LLMApiKey)
      throw new InvalidRequestError(
        `No ${modelParams.provider} API key found in project. Please add one in the project settings.`,
      );

    const parsedKey = LLMApiKeySchema.safeParse(LLMApiKey);
    if (!parsedKey.success) {
      throw new InternalServerError(
        `Could not parse API key for provider ${body.modelParams.provider}: ${parsedKey.error.message}`,
      );
    }

    const traceId = uuidv4();

    const traceName = "replace _localExportEvents";

    const tags = ["playground", modelParams.provider, modelParams.model];

    const { completion, processTracedEvents } = await fetchLLMCompletion({
      messages,
      modelParams,
      streaming: true,
      callbacks: [new PosthogCallbackHandler("playground", body, userId)],
      apiKey: decrypt(parsedKey.data.secretKey),
      extraHeaders: decryptAndParseExtraHeaders(parsedKey.data.extraHeaders),
      baseURL: parsedKey.data.baseURL || undefined,
      config: parsedKey.data.config,
      traceParams: {
        traceId,
        traceName: traceName,
        projectId: body.projectId,
        tags,
        tokenCountDelegate: (response: unknown) => {
          if (typeof response === "object" && response !== null) {
            const res = response as { usage?: { total_tokens?: number } };
            return res.usage?.total_tokens;
          }
          return undefined;
        },
        authCheck: {
          validKey: true,
          scope: {
            projectId: body.projectId,
            accessLevel: "all",
            orgId: "playground", // Using playground as orgId for playground requests
            plan: "cloud:hobby", // Default plan for playground
            rateLimitOverrides: [],
            apiKeyId: "playground", // Using playground as apiKeyId for playground requests
          },
        },
      },
    });

    // Process tracing events before returning response
    await processTracedEvents();
    return new StreamingTextResponse(completion);
  } catch (err) {
    logger.error("Failed to handle chat completion", err);

    if (err instanceof BaseError) {
      return NextResponse.json(
        {
          error: err.name,
          message: err.message,
        },
        { status: err.httpCode },
      );
    }

    if (err instanceof Error) {
      return NextResponse.json(
        {
          message: err.message,
          error: err,
        },
        {
          status: (err as any)?.response?.status ?? (err as any)?.status ?? 500,
        },
      );
    }

    throw err;
  }
}
