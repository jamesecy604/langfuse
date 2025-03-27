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
    await this.getRedis().hmset(key, {
      [BALANCE_DETAILS.CURRENT]: currentBalance.toString(),
      [BALANCE_DETAILS.TOTAL_TOPUPS]: totalTopups.toString(),
      [BALANCE_DETAILS.TOTAL_USAGE]: totalUsage.toString(),
      [BALANCE_DETAILS.UPDATED_AT]: Date.now().toString(),
    });
  }

  async updateRedisBalance(
    userId: string,
    amount: number,
    type: "CREDIT" | "DEBIT",
  ) {
    const key = `${BALANCE_KEY_PREFIX}${userId}`;
    const multi = this.getRedis().multi();

    // Convert amount for DEBIT transactions (negative amount should subtract)
    const adjustedAmount = type === "DEBIT" ? -amount : Math.abs(amount);

    // Update current balance
    multi.hincrbyfloat(key, BALANCE_DETAILS.CURRENT, adjustedAmount);

    // Update totals based on transaction type
    if (type === "CREDIT") {
      multi.hincrbyfloat(key, BALANCE_DETAILS.TOTAL_TOPUPS, amount);
    } else {
      multi.hincrbyfloat(key, BALANCE_DETAILS.TOTAL_USAGE, Math.abs(amount));
    }

    // Update timestamp
    multi.hset(key, BALANCE_DETAILS.UPDATED_AT, Date.now().toString());

    await multi.exec();
    const balance = await this.getRedis().hget(key, BALANCE_DETAILS.CURRENT);
    console.log("=========================Current balance:", balance);
  }

  async getRedisBalance(userId: string) {
    const key = `${BALANCE_KEY_PREFIX}${userId}`;
    const balance = await this.getRedis().hget(key, BALANCE_DETAILS.CURRENT);
    if (balance !== null && balance.toString() !== "0") {
      return parseFloat(balance);
    }

    // Fall back to Clickhouse if Redis has no balance
    const { current, totalTopups, totalUsage } =
      await this.getBalanceDetails(userId);

    // Update Redis with the latest balance from Clickhouse
    await this.initRedisBalance(userId, current, totalTopups, totalUsage);

    return current;
  }

  async getRedisBalanceDetails(userId: string) {
    const key = `${BALANCE_KEY_PREFIX}${userId}`;
    const result = await this.getRedis().hmget(
      key,
      BALANCE_DETAILS.CURRENT,
      BALANCE_DETAILS.TOTAL_TOPUPS,
      BALANCE_DETAILS.TOTAL_USAGE,
      BALANCE_DETAILS.UPDATED_AT,
    );

    return {
      current: parseFloat(result[0] || "0"),
      totalTopups: parseFloat(result[1] || "0"),
      totalUsage: parseFloat(result[2] || "0"),
      updatedAt: result[3] ? new Date(parseInt(result[3])) : null,
    };
  }

  async batchUpdateRedisBalances(
    transactions: Array<{
      userId: string;
      amount: number;
      type: "CREDIT" | "DEBIT";
    }>,
  ) {
    const multi = this.getRedis().multi();

    for (const { userId, amount, type } of transactions) {
      const key = `${BALANCE_KEY_PREFIX}${userId}`;

      // Convert amount for DEBIT transactions (negative amount should subtract)
      const adjustedAmount = type === "DEBIT" ? Math.abs(amount) : amount;

      // Update current balance
      multi.hincrbyfloat(key, BALANCE_DETAILS.CURRENT, adjustedAmount);

      // Update totals based on transaction type
      if (type === "CREDIT") {
        multi.hincrbyfloat(key, BALANCE_DETAILS.TOTAL_TOPUPS, amount);
      } else {
        multi.hincrbyfloat(key, BALANCE_DETAILS.TOTAL_USAGE, Math.abs(amount));
      }

      // Update timestamp
      multi.hset(key, BALANCE_DETAILS.UPDATED_AT, Date.now().toString());
    }

    await multi.exec();
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
      current: parseFloat(row.current),
      totalTopups: parseFloat(row.totalTopups),
      totalUsage: parseFloat(row.totalUsage),
      updatedAt: new Date(),
    };
  }
}
