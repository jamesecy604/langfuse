import { logger } from "../../../../packages/shared/src/server/logger";
import { TokenUsageRepository } from "../../../../packages/shared/src/server/services/repositories/tokenUsageRepository";
import { getQueue } from "../../../../packages/shared/src/server/redis/getQueue";
import { QueueName } from "../../../../packages/shared/src/server/queues";
import type { TokenUsageTransaction } from "../../../../packages/shared/src/server/services/tokenUsageService";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { clickhouseClient } from "../../../../packages/shared/src/server/clickhouse/client";

export class TokenUsageWorkerService {
  private tokenUsageRepo: TokenUsageRepository;

  constructor() {
    this.tokenUsageRepo = new TokenUsageRepository();
  }

  async processQueue(job: Job<TokenUsageTransaction>) {
    const { llmApiKeyId, tokens, cost } = job.data;
    if (!llmApiKeyId || tokens === undefined || !cost) {
      const error = new Error(
        `Invalid token usage transaction data: ${JSON.stringify(job.data)}`,
      );
      logger.error("Invalid token usage transaction job", {
        error,
        jobId: job.id,
        jobData: job.data,
      });
      throw error;
    }

    console.log(
      `[TokenUsageWorker] Processing job ${job.id} for key ${llmApiKeyId}, tokens ${tokens}`,
    );

    try {
      await this.updateClickHouseTokenUsage(llmApiKeyId, tokens, cost);
      console.log(`[TokenUsageWorker] ClickHouse update completed`);

      logger.info(`Processed ClickHouse token usage transaction`, {
        llmApiKeyId,
        tokens,
        cost,
      });
    } catch (error) {
      console.error(`[TokenUsageWorker] Failed to process transaction:`, error);
      logger.error("Failed to process token usage transaction", {
        error,
        llmApiKeyId,
        tokens,
        cost,
      });
      throw error; // Will trigger retry
    }
  }

  private async updateClickHouseTokenUsage(
    llmApiKeyId: string,
    tokens: number,
    cost: number,
  ) {
    const clickhouse = clickhouseClient();
    if (!clickhouse) {
      throw new Error("ClickHouse client not available");
    }
    const now = new Date();

    // Insert to appropriate transaction table
    await clickhouse.insert({
      table: "total_usage_token",
      values: [
        {
          id: crypto.randomUUID(),
          llm_api_key_id: llmApiKeyId,
          created_at: now.toISOString().replace("T", " ").replace("Z", ""),
          updated_at: now.toISOString().replace("T", " ").replace("Z", ""),
          tokens,
          cost,
          _version: 1,
        },
      ],
      format: "JSONEachRow",
    });

    // Check if key has existing token usage
    const currentUsage = await clickhouse.query({
      query: `SELECT tokens, cost FROM llm_api_key_usage WHERE llm_api_key_id = {llmApiKeyId:String}`,
      query_params: { llmApiKeyId },
      format: "JSONEachRow",
    });

    const json = await currentUsage.json();
    const hasExistingUsage = json.length > 0;
    console.log(hasExistingUsage);
    if (hasExistingUsage) {
      // Update existing token usage
      await clickhouse.query({
        query: `
          ALTER TABLE llm_api_key_usage
          UPDATE
            tokens = tokens + ${tokens},
            cost = cost + ${cost},
            updated_at = parseDateTime64BestEffort('${now.toISOString().replace("T", " ").replace("Z", "")}')
          WHERE llm_api_key_id = {llmApiKeyId:String}
        `,
        query_params: {
          llmApiKeyId,
          updatedAt: now.toISOString(),
        },
      });
    } else {
      // Insert new token usage
      await clickhouse.insert({
        table: "llm_api_key_usage",
        values: [
          {
            id: crypto.randomUUID(),
            updated_at: now.toISOString().replace("T", " ").replace("Z", ""),
            llm_api_key_id: llmApiKeyId,
            tokens: tokens,
            cost: cost,
          },
        ],
        format: "JSONEachRow",
      });
    }
  }
}
