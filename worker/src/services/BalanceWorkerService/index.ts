import { logger } from "../../../../packages/shared/src/server/logger";
import { BalanceRepository } from "../../../../packages/shared/src/server/services/repositories/balanceRepository";
import { getQueue } from "../../../../packages/shared/src/server/redis/getQueue";
import { QueueName } from "../../../../packages/shared/src/server/queues";
import type { BalanceTransaction } from "../../../../packages/shared/src/server/services/balanceService";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { clickhouseClient } from "../../../../packages/shared/src/server/clickhouse/client";

export class BalanceWorkerService {
  private balanceRepo: BalanceRepository;

  constructor() {
    this.balanceRepo = new BalanceRepository();
  }

  async processQueue(job: Job<BalanceTransaction>) {
    const { userId, amount, type } = job.data;

    if (!userId || amount === undefined || !type) {
      const error = new Error(
        `Invalid balance transaction data: ${JSON.stringify(job.data)}`,
      );
      logger.error("Invalid balance transaction job", {
        error,
        jobId: job.id,
        jobData: job.data,
      });
      throw error;
    }

    console.log(
      `[BalanceWorker] Processing job ${job.id} for user ${userId}, amount ${amount}, type ${type}`,
    );

    try {
      // Map transaction type to CREDIT/DEBIT for ClickHouse

      const clickHouseAmount =
        type === "topup" ? Math.abs(amount) : -Math.abs(amount);

      console.log(`[BalanceWorker] Updating ClickHouse balance...`);
      await this.updateClickHouseBalance(userId, clickHouseAmount, type);
      console.log(`[BalanceWorker] ClickHouse update completed`);

      logger.info(`Processed ClickHouse balance transaction`, {
        userId,
        amount,
        type,
      });
    } catch (error) {
      console.error(`[BalanceWorker] Failed to process transaction:`, error);
      logger.error("Failed to process balance transaction", {
        error,
        userId,
        amount,
        type,
      });
      throw error; // Will trigger retry
    }
  }

  private async updateClickHouseBalance(
    userId: string,
    amount: number,
    type: "topup" | "refund" | "usage",
  ) {
    const clickhouse = clickhouseClient();
    if (!clickhouse) {
      throw new Error("ClickHouse client not available");
    }
    const now = new Date();

    // Insert to appropriate transaction table
    await clickhouse.insert({
      table:
        type === "usage"
          ? "totalUsage"
          : type === "topup"
            ? "totalUsage"
            : "totalUsage", //todo in the future, maybe we have 3 tables: topup, refund and totalUsage
      values: [
        {
          id: crypto.randomUUID(),
          userId,
          amount,
          timestamp: now,
          description: "System transaction",
          type: type,
        },
      ],
      format: "JSONEachRow",
    });

    // Check if user has existing balance
    const currentBalance = await clickhouse.query({
      query: `SELECT balance FROM current_balance WHERE userId = {userId:String}`,
      query_params: { userId },
      format: "JSONEachRow",
    });

    const json = await currentBalance.json();
    const hasExistingBalance = json.length > 0;

    if (hasExistingBalance) {
      // Update existing balance
      await clickhouse.query({
        query: `
          ALTER TABLE current_balance
          UPDATE
            balance = balance + ${type === "topup" ? amount : -amount},
            updatedAt = parseDateTime64BestEffort({updatedAt:String})
          WHERE userId = {userId:String}
        `,
        query_params: {
          userId,
          updatedAt: now.toISOString(),
        },
      });
    } else {
      // Insert new balance
      await clickhouse.insert({
        table: "current_balance",
        values: [
          {
            userId,
            balance: type === "topup" ? amount : -amount,
            updatedAt: now,
          },
        ],
        format: "JSONEachRow",
      });
    }
  }
}
