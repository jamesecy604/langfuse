import { redis } from "../../redis/redis";
import { clickhouseClient } from "../../clickhouse/client";
import { logger } from "../../logger";
import type { ResponseJSON } from "@clickhouse/client";

interface TokenUsageResult {
  tokens: number;
  cost: number | null;
}

interface ClickHouseTokenUsageRow {
  tokens: string;
  cost: string | null;
  updatedAt: string;
}

interface ClickHouseTokenUsageResponse {
  data: ClickHouseTokenUsageRow[];
}

interface LLMApiKey {
  id: string;
  secretKey: string;
  model: string;
  projectId: string;
  tokens: number | null;
}

const TOKEN_USAGE_KEY_PREFIX = "token_usage:";
const TOKEN_USAGE_DETAILS = {
  TOKENS: "tokens",
  COST: "cost",
  UPDATED_AT: "updatedAt",
};

export class TokenUsageRepository {
  private transactionInProgress = false;

  async beginTransaction() {
    if (this.transactionInProgress) {
      throw new Error("Transaction already in progress");
    }
    this.transactionInProgress = true;
    await this.getRedis().multi();
  }

  async commitTransaction() {
    if (!this.transactionInProgress) {
      throw new Error("No transaction in progress");
    }
    await this.getRedis().exec();
    this.transactionInProgress = false;
  }

  async rollbackTransaction() {
    if (!this.transactionInProgress) {
      throw new Error("No transaction in progress");
    }
    await this.getRedis().discard();
    this.transactionInProgress = false;
  }

  private getRedis() {
    if (!redis) {
      throw new Error("Redis client not initialized");
    }
    return redis;
  }

  private async getClickhouse() {
    const client = clickhouseClient();
    if (!client) {
      throw new Error(
        "ClickHouse client not initialized - check CLICKHOUSE_* env vars",
      );
    }
    return client;
  }

  async initRedisTokenUsage(
    llmApiKeyId: string,
    tokens: number | null,
    cost: number | null,
  ) {
    const key = `${TOKEN_USAGE_KEY_PREFIX}${llmApiKeyId}`;
    const redis = this.getRedis();
    await redis
      .multi()
      .hmset(key, {
        [TOKEN_USAGE_DETAILS.TOKENS]: tokens?.toString() ?? "null",
        [TOKEN_USAGE_DETAILS.COST]: cost?.toString() ?? "null",
        [TOKEN_USAGE_DETAILS.UPDATED_AT]: Date.now().toString(),
      })
      .expire(key, Number(process.env.REDIS_TOKEN_USAGE_TTL_SECONDS) || 120)
      .exec();
  }

  async updateRedisTokenUsage(
    llmApiKeyId: string,
    tokens: number,
    cost: number | null,
  ) {
    const key = `${TOKEN_USAGE_KEY_PREFIX}${llmApiKeyId}`;
    const redis = this.getRedis();
    const ttl = Number(process.env.REDIS_TOKEN_USAGE_TTL_SECONDS) || 120;

    const maxAttempts = 5;
    const baseDelayMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await redis.watch(key);

        const exists = await redis.exists(key);

        if (!exists) {
          const { tokens: initialTokens, cost: initialCost } =
            await this.getTokenUsageDetails(llmApiKeyId);
          await this.initRedisTokenUsage(
            llmApiKeyId,
            initialTokens,
            initialCost,
          );
          continue;
        }

        const [currentTokens, currentCost] = await redis.hmget(
          key,
          TOKEN_USAGE_DETAILS.TOKENS,
          TOKEN_USAGE_DETAILS.COST,
        );

        const initialTokens = currentTokens ? parseInt(currentTokens) : 0;
        const initialCost =
          currentCost && currentCost !== "null"
            ? parseFloat(currentCost)
            : null;

        const newTokens = initialTokens + tokens;
        const newCost = cost !== null ? (initialCost || 0) + cost : initialCost;

        const multi = redis.multi();
        multi.hmset(key, {
          [TOKEN_USAGE_DETAILS.TOKENS]: newTokens.toString(),
          [TOKEN_USAGE_DETAILS.COST]: newCost?.toString() ?? "null",
          [TOKEN_USAGE_DETAILS.UPDATED_AT]: Date.now().toString(),
        });
        multi.expire(key, ttl);

        const result = await multi.exec();
        if (result === null) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          logger.warn(
            `Token usage update conflict (attempt ${attempt + 1}), retrying in ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        return newTokens;
      } catch (error) {
        logger.error("Token usage update error", {
          error,
          llmApiKeyId,
          attempt,
          tokens,
          cost,
        });
        await redis.unwatch();
        throw error;
      }
    }

    logger.error(
      `Failed to update token usage after ${maxAttempts} attempts due to concurrent modifications`,
      { llmApiKeyId, tokens, cost },
    );
    return null;
  }

  async getRedisTokenUsage(llmApiKeyId: string): Promise<{
    tokens: number | null;
    cost: number | null;
    updatedAt: Date | null;
  } | null> {
    const key = `${TOKEN_USAGE_KEY_PREFIX}${llmApiKeyId}`;
    const redis = this.getRedis();

    const exists = await redis.exists(key);
    if (!exists) {
      return null;
    }

    const tokens = await redis.hget(key, TOKEN_USAGE_DETAILS.TOKENS);
    const cost = await redis.hget(key, TOKEN_USAGE_DETAILS.COST);
    const updatedAt = await redis.hget(key, TOKEN_USAGE_DETAILS.UPDATED_AT);
    if (tokens === null || cost === null || updatedAt === null) {
      return null;
    }

    return {
      tokens: parseInt(tokens),
      cost: cost !== "null" ? parseFloat(cost) : null,
      updatedAt: new Date(parseInt(updatedAt)),
    };
  }

  async getRedisTokenUsageDetails(llmApiKeyId: string): Promise<{
    tokens: number;
    cost: number | null;
    updatedAt: Date | null;
  } | null> {
    const key = `${TOKEN_USAGE_KEY_PREFIX}${llmApiKeyId}`;
    const redis = this.getRedis();

    const exists = await redis.exists(key);

    if (!exists) {
      return null;
    }

    const result = await redis.hmget(
      key,
      TOKEN_USAGE_DETAILS.TOKENS,
      TOKEN_USAGE_DETAILS.COST,
      TOKEN_USAGE_DETAILS.UPDATED_AT,
    );

    if (result.some((val) => val === null)) {
      return null;
    }

    if (!result[0] || !result[1]) {
      throw new Error("Invalid token usage data from Redis");
    }
    return {
      tokens: parseInt(result[0]),
      cost: result[1] && result[1] !== "null" ? parseFloat(result[1]) : null,
      updatedAt: result[2] ? new Date(parseInt(result[2])) : null,
    };
  }

  async batchUpdateRedisTokenUsage(
    updates: Array<{
      llmApiKeyId: string;
      tokens: number;
      cost: number | null;
    }>,
  ) {
    const redis = this.getRedis();
    const ttl = Number(process.env.REDIS_TOKEN_USAGE_TTL_SECONDS) || 120;
    const maxAttempts = 5;
    const baseDelayMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const keys = updates.map(
          (u) => `${TOKEN_USAGE_KEY_PREFIX}${u.llmApiKeyId}`,
        );
        await redis.watch(...keys);

        const multi = redis.multi();

        for (const { llmApiKeyId, tokens, cost } of updates) {
          const key = `${TOKEN_USAGE_KEY_PREFIX}${llmApiKeyId}`;
          multi.exists(key);
          multi.hincrby(key, TOKEN_USAGE_DETAILS.TOKENS, tokens);

          if (cost !== null) {
            multi.hincrbyfloat(key, TOKEN_USAGE_DETAILS.COST, cost);
          }
          multi.hset(
            key,
            TOKEN_USAGE_DETAILS.UPDATED_AT,
            Date.now().toString(),
          );
          multi.expire(key, ttl);
        }

        const results = await multi.exec();
        if (results === null) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          logger.warn(
            `Batch token usage update conflict (attempt ${attempt + 1}), retrying in ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        for (let i = 0; i < updates.length; i++) {
          const exists = results[i * 6]; // Each update has 6 operations
          if (!exists) {
            const { llmApiKeyId } = updates[i];
            const { tokens, cost } =
              await this.getTokenUsageDetails(llmApiKeyId);
            await this.initRedisTokenUsage(llmApiKeyId, tokens, cost);
          }
        }

        logger.info(
          `Batch token usage update succeeded after ${attempt + 1} attempts`,
          { updateCount: updates.length },
        );
        return true;
      } catch (error) {
        logger.error("Batch token usage update error", {
          error,
          attempt,
          updateCount: updates.length,
        });
        await redis.unwatch();
        throw error;
      }
    }

    logger.error(
      `Failed batch token usage update after ${maxAttempts} attempts due to concurrent modifications`,
      { updateCount: updates.length },
    );
    return false;
  }

  async chooseLLMApiKeyId(apiKeyIds: string[]): Promise<string | null> {
    if (apiKeyIds.length === 0) return null;

    const redis = this.getRedis();
    const clickhouse = await this.getClickhouse();
    const ttl = Number(process.env.REDIS_TOKEN_USAGE_TTL_SECONDS) || 120;

    // First try to get all keys from Redis
    const redisResults = await Promise.all(
      apiKeyIds.map(async (id) => {
        const details = await this.getRedisTokenUsageDetails(id);
        return {
          id,
          tokens: details?.tokens ?? null,
        };
      }),
    );

    // Find keys that weren't in Redis
    const missingFromRedis = redisResults
      .filter((result) => result.tokens === null)
      .map((result) => result.id);

    let clickhouseResults: Array<{ id: string; tokens: number }> = [];

    // Fall back to ClickHouse for missing keys
    if (missingFromRedis.length > 0) {
      const result = await clickhouse.query({
        query: `
          SELECT 
            llm_api_key_id as id,
            tokens
          FROM llm_api_key_usage
          WHERE llm_api_key_id IN {ids:Array(String)}
        `,
        query_params: { ids: missingFromRedis },
        format: "JSON",
      });

      const response = await result.json();
      if (response?.data && Array.isArray(response.data)) {
        clickhouseResults = response.data.map((row: any) => ({
          id: row.id,
          tokens: parseInt(row.tokens),
        }));

        // Add default 0-token entries for any missing IDs
        const missingIds = missingFromRedis.filter(
          (id) => !clickhouseResults.some((r) => r.id === id),
        );
        const zeroTokenEntries = missingIds.map((id) => ({
          id,
          tokens: 0,
        }));
        clickhouseResults = [...clickhouseResults, ...zeroTokenEntries];

        // Update Redis with all results (both from ClickHouse and zero entries)
        await Promise.all(
          clickhouseResults.map(async (key) => {
            await this.initRedisTokenUsage(key.id, key.tokens, null);
          }),
        );
      }
    }

    // Combine Redis and ClickHouse results
    const allResults = [
      ...redisResults
        .filter((r) => r.tokens !== null)
        .map((r) => ({ id: r.id, tokens: r.tokens! })),
      ...clickhouseResults,
    ];

    if (allResults.length === 0) return null;

    // Find key with minimum usage
    const minUsageKey = allResults.reduce((prev, curr) =>
      curr.tokens < prev.tokens ? curr : prev,
    );

    return minUsageKey.id;
  }

  async getTokenUsageDetails(llmApiKeyId: string): Promise<{
    tokens: number;
    cost: number | null;
    updatedAt: Date | null;
  }> {
    const clickhouse = await this.getClickhouse();
    const result = await clickhouse.query({
      query: `
        SELECT 
          tokens as tokens,
          cost,
          updated_at as updatedAt
        FROM llm_api_key_usage
        WHERE llm_api_key_id = {llmApiKeyId:String}
      `,
      query_params: { llmApiKeyId },
      format: "JSON",
    });

    const response = await result.json();

    function isClickHouseTokenUsageResponse(
      obj: unknown,
    ): obj is ClickHouseTokenUsageResponse {
      return (
        typeof obj === "object" &&
        obj !== null &&
        "data" in obj &&
        Array.isArray(obj.data) &&
        obj.data.length > 0 &&
        typeof obj.data[0] === "object" &&
        obj.data[0] !== null &&
        "tokens" in obj.data[0]
      );
    }

    if (!isClickHouseTokenUsageResponse(response)) {
      return {
        tokens: 0,
        cost: null,
        updatedAt: new Date(),
      };
    }

    const row = response.data[0] as ClickHouseTokenUsageRow;
    return {
      tokens: parseInt(row.tokens),
      cost: row.cost ? parseFloat(row.cost) : null,
      updatedAt: new Date(row.updatedAt),
    };
  }
}
