import { redis } from "../../redis/redis";
import { clickhouseClient } from "../../clickhouse/client";
import { logger } from "../../logger";
import type { ResponseJSON } from "@clickhouse/client";

interface BalanceResult {
  balance: number;
  totalTopups: number;
  totalUsage: number;
}

interface ClickHouseBalanceRow {
  current: string;
  totalTopups: string;
  totalUsage: string;
}

interface ClickHouseBalanceResponse {
  data: ClickHouseBalanceRow[];
}

const BALANCE_KEY_PREFIX = "balance:";
const BALANCE_DETAILS = {
  CURRENT: "current",
  TOTAL_TOPUPS: "totalTopups",
  TOTAL_USAGE: "totalUsage",
  UPDATED_AT: "updatedAt",
};

export class BalanceRepository {
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

  async initRedisBalance(
    userId: string,
    currentBalance: number,
    totalTopups: number,
    totalUsage: number,
  ) {
    const key = `${BALANCE_KEY_PREFIX}${userId}`;
    const redis = this.getRedis();
    await redis
      .multi()
      .hmset(key, {
        [BALANCE_DETAILS.CURRENT]: currentBalance.toString(),
        [BALANCE_DETAILS.TOTAL_TOPUPS]: totalTopups.toString(),
        [BALANCE_DETAILS.TOTAL_USAGE]: totalUsage.toString(),
        [BALANCE_DETAILS.UPDATED_AT]: Date.now().toString(),
      })
      .expire(key, Number(process.env.REDIS_BALANCE_TTL_SECONDS) || 120)
      .exec();
  }

  async updateRedisBalance(
    userId: string,
    amount: number,
    type: "topup" | "refund" | "usage",
  ) {
    const key = `${BALANCE_KEY_PREFIX}${userId}`;
    const redis = this.getRedis();
    const ttl = Number(process.env.REDIS_BALANCE_TTL_SECONDS) || 120;

    // Retry with exponential backoff for concurrent modifications
    const maxAttempts = 5;
    const baseDelayMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await redis.watch(key);

        // Get all balance fields atomically
        const [currentBalance, totalTopups, totalUsage] = await redis.hmget(
          key,
          BALANCE_DETAILS.CURRENT,
          BALANCE_DETAILS.TOTAL_TOPUPS,
          BALANCE_DETAILS.TOTAL_USAGE,
        );

        const initialBalance = currentBalance ? parseFloat(currentBalance) : 0;
        const initialTopups = totalTopups ? parseFloat(totalTopups) : 0;
        const initialUsage = totalUsage ? parseFloat(totalUsage) : 0;

        // Calculate new values
        const newBalance =
          type === "topup"
            ? initialBalance + Math.abs(amount)
            : initialBalance - Math.abs(amount);

        const newTopups =
          type === "topup" ? initialTopups + Math.abs(amount) : initialTopups;

        const newUsage =
          type === "refund" || type === "usage"
            ? initialUsage + Math.abs(amount)
            : initialUsage;

        // Start transaction
        const multi = redis.multi();
        multi.hmset(key, {
          [BALANCE_DETAILS.CURRENT]: newBalance.toString(),
          [BALANCE_DETAILS.TOTAL_TOPUPS]: newTopups.toString(),
          [BALANCE_DETAILS.TOTAL_USAGE]: newUsage.toString(),
          [BALANCE_DETAILS.UPDATED_AT]: Date.now().toString(),
        });
        multi.expire(key, ttl);

        // Execute transaction
        const result = await multi.exec();
        if (result === null) {
          // Transaction failed due to concurrent modification
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          logger.warn(
            `Balance update conflict (attempt ${attempt + 1}), retrying in ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        logger.info(
          `Balance updated successfully after ${attempt + 1} attempts`,
          {
            userId,
            newBalance,
            type,
            amount,
          },
        );
        return newBalance;
      } catch (error) {
        logger.error("Balance update error", {
          error,
          userId,
          attempt,
          amount,
          type,
        });
        await redis.unwatch();
        throw error;
      }
    }

    logger.error(
      `Failed to update balance after ${maxAttempts} attempts due to concurrent modifications`,
      { userId, amount, type },
    );
    return null;
  }

  async getTransactions(userId: string, from?: Date, to?: Date) {
    const clickhouse = await this.getClickhouse();
    try {
      let query = `
        SELECT 
          t.id as transactionId,
          t.amount,
          t.type,
          t.description,
          t.timestamp,
          t.userId
        FROM totalUsage t
        WHERE t.userId = {userId:String}
      `;

      const params: Record<string, any> = { userId };

      if (from) {
        query += ` AND t.timestamp >= {from:DateTime}`;
        // Format as YYYY-MM-DD HH:MM:SS without milliseconds
        params.from = from
          .toISOString()
          .replace("T", " ")
          .replace("Z", "")
          .split(".")[0];
      }

      if (to) {
        query += ` AND t.timestamp <= {to:DateTime}`;
        // Format as YYYY-MM-DD HH:MM:SS without milliseconds
        params.to = to
          .toISOString()
          .replace("T", " ")
          .replace("Z", "")
          .split(".")[0];
      }

      query += ` ORDER BY t.timestamp DESC LIMIT 100`;

      const result = await clickhouse.query({
        query,
        query_params: params,
        format: "JSON",
      });

      const response = await result.json();
      return response.data.map((row: any) => ({
        transactionId: row.transactionId,
        amount: parseFloat(row.amount),
        type: row.type,
        description: row.description,
        timestamp: new Date(row.timestamp),
        userId: row.userId,
      }));
    } catch (error) {
      logger.error("Failed to get transactions", {
        userId,
        from,
        to,
        error,
      });
      throw error;
    }
  }

  async getRedisBalance(userId: string): Promise<number | null> {
    const key = `${BALANCE_KEY_PREFIX}${userId}`;
    const redis = this.getRedis();

    // Check if key exists and hasn't expired
    const exists = await redis.exists(key);
    if (!exists) {
      return null;
    }

    const balance = await redis.hget(key, BALANCE_DETAILS.CURRENT);
    if (balance === null) {
      return null;
    }

    return parseFloat(balance);
  }

  async getRedisBalanceDetails(userId: string): Promise<{
    current: number;
    totalTopups: number;
    totalUsage: number;
    updatedAt: Date | null;
  } | null> {
    const key = `${BALANCE_KEY_PREFIX}${userId}`;
    const redis = this.getRedis();

    // Check if key exists and hasn't expired
    const exists = await redis.exists(key);
    if (!exists) {
      return null;
    }

    const result = await redis.hmget(
      key,
      BALANCE_DETAILS.CURRENT,
      BALANCE_DETAILS.TOTAL_TOPUPS,
      BALANCE_DETAILS.TOTAL_USAGE,
      BALANCE_DETAILS.UPDATED_AT,
    );

    // If any field is null, consider the entire balance null
    if (result.some((val) => val === null)) {
      return null;
    }

    if (!result[0] || !result[1] || !result[2]) {
      throw new Error("Invalid balance data from Redis");
    }
    return {
      current: parseFloat(result[0]),
      totalTopups: parseFloat(result[1]),
      totalUsage: parseFloat(result[2]),
      updatedAt: result[3] ? new Date(parseInt(result[3])) : null,
    };
  }

  async batchUpdateRedisBalances(
    transactions: Array<{
      userId: string;
      amount: number;
      type: "topup" | "refund" | "usage";
    }>,
  ) {
    const redis = this.getRedis();
    const ttl = Number(process.env.REDIS_BALANCE_TTL_SECONDS) || 120;
    const maxAttempts = 5;
    const baseDelayMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Watch all keys first
        const keys = transactions.map(
          (t) => `${BALANCE_KEY_PREFIX}${t.userId}`,
        );
        await redis.watch(...keys);

        const multi = redis.multi();

        for (const { userId, amount, type } of transactions) {
          const key = `${BALANCE_KEY_PREFIX}${userId}`;

          // Check if key exists first
          multi.exists(key);

          // Convert amount for DEBIT transactions (negative amount should subtract)
          const adjustedAmount =
            type === "refund" || type === "usage" ? Math.abs(amount) : amount;

          // Update current balance
          multi.hincrbyfloat(key, BALANCE_DETAILS.CURRENT, adjustedAmount);

          // Update totals based on transaction type
          if (type === "topup") {
            multi.hincrbyfloat(key, BALANCE_DETAILS.TOTAL_TOPUPS, amount);
          } else {
            multi.hincrbyfloat(
              key,
              BALANCE_DETAILS.TOTAL_USAGE,
              Math.abs(amount),
            );
          }

          // Update timestamp and TTL
          multi.hset(key, BALANCE_DETAILS.UPDATED_AT, Date.now().toString());
          multi.expire(key, ttl);
        }

        const results = await multi.exec();
        if (results === null) {
          // Transaction failed due to concurrent modification
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          logger.warn(
            `Batch balance update conflict (attempt ${attempt + 1}), retrying in ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Check if any keys didn't exist and need initialization
        for (let i = 0; i < transactions.length; i++) {
          const exists = results[i * 5]; // Each transaction has 5 operations
          if (!exists) {
            const { userId } = transactions[i];
            const { current, totalTopups, totalUsage } =
              await this.getBalanceDetails(userId);
            await this.initRedisBalance(
              userId,
              current,
              totalTopups,
              totalUsage,
            );
          }
        }

        logger.info(
          `Batch balance update succeeded after ${attempt + 1} attempts`,
          { transactionCount: transactions.length },
        );
        return true;
      } catch (error) {
        logger.error("Batch balance update error", {
          error,
          attempt,
          transactionCount: transactions.length,
        });
        await redis.unwatch();
        throw error;
      }
    }

    logger.error(
      `Failed batch balance update after ${maxAttempts} attempts due to concurrent modifications`,
      { transactionCount: transactions.length },
    );
    return false;
  }

  async getAllBalancesFromClickHouse(): Promise<
    Array<{
      userId: string;
      current: number;
      totalTopups: number;
      totalUsage: number;
    }>
  > {
    const clickhouse = await this.getClickhouse();
    const result = await clickhouse.query({
      query: `
        SELECT 
          userId,
          balance as current,
          0 as totalTopups,
          0 as totalUsage
        FROM current_balance
      `,
      format: "JSON",
    });

    const response = await result.json();
    return response.data.map((row: any) => ({
      userId: row.userId,
      current: parseFloat(row.current),
      totalTopups: parseFloat(row.totalTopups),
      totalUsage: parseFloat(row.totalUsage),
    }));
  }

  async syncAllBalancesToRedis() {
    const balances = await this.getAllBalancesFromClickHouse();
    for (const balance of balances) {
      await this.initRedisBalance(
        balance.userId,
        balance.current,
        balance.totalTopups,
        balance.totalUsage,
      );
    }
    return balances.length;
  }

  async getBalanceDetails(userId: string): Promise<{
    current: number;
    totalTopups: number;
    totalUsage: number;
    updatedAt: Date | null;
  }> {
    const clickhouse = await this.getClickhouse();
    const result = await clickhouse.query({
      query: `
        SELECT 
          balance as current,
          0 as totalTopups,
          0 as totalUsage,
          updatedAt
        FROM current_balance
        WHERE userId = {userId:String}
      `,
      query_params: { userId },
      format: "JSON",
    });

    const response = await result.json();
    console.log(
      "ClickHouse balance response:",
      JSON.stringify(response, null, 2),
    );

    function isClickHouseBalanceResponse(
      obj: unknown,
    ): obj is ClickHouseBalanceResponse {
      return (
        typeof obj === "object" &&
        obj !== null &&
        "data" in obj &&
        Array.isArray(obj.data) &&
        obj.data.length > 0 &&
        typeof obj.data[0] === "object" &&
        obj.data[0] !== null &&
        "current" in obj.data[0] &&
        "totalTopups" in obj.data[0] &&
        "totalUsage" in obj.data[0]
      );
    }

    if (!isClickHouseBalanceResponse(response)) {
      return {
        current: 0,
        totalTopups: 0,
        totalUsage: 0,
        updatedAt: new Date(),
      };
    }

    const row = response.data[0] as ClickHouseBalanceRow;
    return {
      current: parseFloat(parseFloat(row.current).toFixed(6)),
      totalTopups: parseFloat(parseFloat(row.totalTopups).toFixed(6)),
      totalUsage: parseFloat(parseFloat(row.totalUsage).toFixed(6)),
      updatedAt: new Date(),
    };
  }
}
