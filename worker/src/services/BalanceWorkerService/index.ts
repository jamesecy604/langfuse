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
    // Handle both direct data and payload formats
    const data = job.data.payload || job.data;

    if (!data) {
      const error = new Error(
        `-------Invalid balance transaction data: ${JSON.stringify(job.data)}`,
      );
      logger.error("Invalid balance transaction job", {
        error,
        jobId: job.id,
        jobData: job.data,
      });
      throw error;
    }

    const { userId, amount, type } = data;
    if (!userId || amount === undefined || !type) {
      const error = new Error(
        `-----------Invalid balance transaction data: missing required fields: ${JSON.stringify(data)}`,
      );
      logger.error("---------Invalid balance transaction job", {
        error,
        jobId: job.id,
        jobData: job.data,
      });
      throw error;
    }

    console.log(
      `-----------[BalanceWorker] Processing job ${job.id} for user ${userId}, amount ${amount}, type ${type}`,
    );

    try {
      // Map transaction type to CREDIT/DEBIT for ClickHouse

      // For refunds, we already pass negative amount from the service
      const clickHouseAmount = type === "topup" ? Math.abs(amount) : amount;

      console.log(
        `---------------[BalanceWorker] Updating ClickHouse balance...`,
      );
      await this.updateClickHouseBalance(
        userId,
        clickHouseAmount,
        type,
        job,
        data.paymentIntentId,
      );
      console.log(
        `------------------[BalanceWorker] ClickHouse update completed`,
      );

      logger.info(
        `---------------------Processed ClickHouse balance transaction`,
        {
          userId,
          amount,
          type,
        },
      );
    } catch (error) {
      console.error(
        `--------------------------[BalanceWorker] Failed to process transaction:`,
        error,
      );
      logger.error("---------------Failed to process balance transaction", {
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
    job: Job<BalanceTransaction>,
    paymentIntentId?: string,
  ) {
    const clickhouse = clickhouseClient();
    if (!clickhouse) {
      throw new Error("ClickHouse client not available");
    }
    const now = new Date();
    // Format timestamp without milliseconds for ClickHouse compatibility
    const timestamp = new Date(now.toISOString().split(".")[0] + "Z");

    // Insert to appropriate transaction table
    const transactionData = {
      id: crypto.randomUUID(),
      userId,
      amount,
      timestamp: timestamp,
      description: "System transaction",
      type: type,
      paymentIntentId: paymentIntentId || null,
    };

    console.log(
      "--------------[BalanceWorker] Inserting into totalUsage:",
      transactionData,
    );

    try {
      const insertResult = await clickhouse.insert({
        table: "totalUsage",
        values: [transactionData],
        format: "JSONEachRow",
      });

      if (!insertResult.query_id) {
        throw new Error(
          "------------------ClickHouse insert failed - no query_id returned",
        );
      }

      console.log(
        "---------------[BalanceWorker] Successfully inserted into totalUsage, query_id:",
        insertResult.query_id,
      );
    } catch (error) {
      console.error(
        "-------------------[BalanceWorker] Failed to insert into totalUsage:",
        error,
      );
      throw error;
    }

    // Check if user has existing balance
    const currentBalance = await clickhouse.query({
      query: `SELECT balance FROM current_balance WHERE userId = {userId:String}`,
      query_params: { userId },
      format: "JSONEachRow",
    });

    const json = await currentBalance.json();
    const hasExistingBalance = json.length > 0;

    if (hasExistingBalance) {
      // Update existing balance - for refunds we already have negative amount
      await clickhouse.query({
        query: `
          ALTER TABLE current_balance
          UPDATE
            balance = balance + ${amount},
            updatedAt = parseDateTimeBestEffort({updatedAt:String})
          WHERE userId = {userId:String}
        `,
        query_params: {
          userId,
          updatedAt: now.toISOString(),
        },
      });
    } else {
      // Insert new balance - for refunds we already have negative amount
      await clickhouse.insert({
        table: "current_balance",
        values: [
          {
            userId,
            balance: amount,
            updatedAt: now,
          },
        ],
        format: "JSONEachRow",
      });
    }
  }
}
