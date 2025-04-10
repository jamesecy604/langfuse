import { logger } from "../logger";
import { QueueName, QueueJobs } from "../queues";
import { getQueue } from "../redis/getQueue";
import { BalanceRepository } from "./repositories/balanceRepository";

export interface BalanceTransaction {
  transactionId: string;
  amount: number;
  type: "topup" | "refund" | "usage";
  description: string;
  timestamp: Date;
  userId: string;
}

interface BalanceDetails {
  current: number;
  totalTopups: number;
  totalUsage: number;
  updatedAt: Date | null;
}

export interface IBalanceService {
  initBalance(userId: string): Promise<void>;
  updateBalance(
    userId: string,
    amount: number,
    type: "topup" | "refund" | "usage",
    description: string,
  ): Promise<boolean>;
  getCurrentBalance(userId: string): Promise<number | null>;
  getBalanceDetails(userId: string): Promise<BalanceDetails | null>;
  getTransactions(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<BalanceTransaction[]>;
  batchUpdate(
    transactions: Array<{
      userId: string;
      amount: number;
      type: "topup" | "refund" | "usage";
      description: string;
    }>,
  ): Promise<boolean>;
}

export class BalanceService implements IBalanceService {
  constructor(
    private balanceRepository: BalanceRepository = new BalanceRepository(),
    private projectId: string = "default",
  ) {}

  async initBalance(userId: string) {
    try {
      console.log(`[BalanceService] Initializing balance for user ${userId}`);
      // Fetch initial balance from ClickHouse
      const details = await this.balanceRepository.getBalanceDetails(userId);
      console.log(
        `[BalanceService] ClickHouse balance details:`,
        JSON.stringify(details),
      );

      // Initialize Redis with the current balance
      console.log(`[BalanceService] Initializing Redis balance with values:`, {
        current: details.current,
        totalTopups: details.totalTopups,
        totalUsage: details.totalUsage,
      });
      await this.balanceRepository.initRedisBalance(
        userId,
        details.current,
        details.totalTopups,
        details.totalUsage,
      );
      console.log(`[BalanceService] Redis balance initialized successfully`);
    } catch (error) {
      logger.error("Failed to initialize balance", { userId, error });
      throw error;
    }
  }

  private createTransaction(
    userId: string,
    amount: number,
    type: "topup" | "refund" | "usage",
    description: string,
  ) {
    return {
      projectId: this.projectId,
      transactionId: `${userId}-${Date.now()}`,
      userId,
      amount: type === "topup" ? -Math.abs(amount) : Math.abs(amount),
      type,
      description,
    };
  }

  async updateBalance(
    userId: string,
    amount: number,
    type: "topup" | "refund" | "usage",
    description: string,
  ): Promise<boolean> {
    console.log(
      `[BalanceService] updateBalance called for user ${userId}, amount ${amount}, type ${type}`,
    );
    const transaction = this.createTransaction(
      userId,
      amount,
      type,
      description,
    );
    console.log(`[BalanceService] Created transaction:`, transaction);

    try {
      // Check if Redis balance exists first
      const currentBalance =
        await this.balanceRepository.getRedisBalance(userId);
      if (currentBalance === null) {
        console.log(
          `[BalanceService] Redis balance missing/expired, initializing from DB`,
        );
        await this.initBalance(userId);
      }

      // Update Redis and get new balance
      console.log(`[BalanceService] Updating Redis balance...`);
      const newBalance = await this.balanceRepository.updateRedisBalance(
        userId,
        amount,
        type,
      );

      if (newBalance === null) {
        logger.error("Redis balance update failed - returned null", {
          userId,
          amount,
          type,
          description,
        });
        return false;
      }

      // Only queue ClickHouse update after successful Redis update
      console.log(
        `[BalanceService] Getting queue ${QueueName.BalanceTransactionQueue}...`,
      );
      const queue = await getQueue(QueueName.BalanceTransactionQueue);
      if (queue) {
        const jobData = {
          ...transaction,
          timestamp: new Date(),
          id: `${userId}-${Date.now()}`,
        };
        await queue.add(QueueJobs.BalanceTransactionJob, jobData);
      } else {
        console.error(
          `[BalanceService] Queue ${QueueName.BalanceTransactionQueue} not found`,
        );
      }

      return true;
    } catch (error) {
      logger.error("Failed to update balance", {
        userId,
        amount,
        type,
        description,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async getCurrentBalance(userId: string) {
    try {
      // Get from Redis cache first
      const balance = await this.balanceRepository.getRedisBalance(userId);

      if (balance === null) {
        // Redis data expired or missing, reinitialize from ClickHouse
        await this.initBalance(userId);
        const newBalance = await this.balanceRepository.getRedisBalance(userId);
        return newBalance;
      }
      return balance;
    } catch (error) {
      logger.error("Failed to get balance", { userId, error });
      throw error;
    }
  }

  async getTransactions(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<BalanceTransaction[]> {
    try {
      return await this.balanceRepository.getTransactions(userId, from, to);
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

  async getBalanceDetails(userId: string) {
    try {
      // Get all details from Redis
      const details =
        await this.balanceRepository.getRedisBalanceDetails(userId);

      if (details === null) {
        // Redis data expired or missing, reinitialize from ClickHouse
        await this.initBalance(userId);
        const newDetails =
          await this.balanceRepository.getRedisBalanceDetails(userId);

        return newDetails;
      }
      return details;
    } catch (error) {
      logger.error("Failed to get balance details", { userId, error });
      throw error;
    }
  }

  /**
   * Processes multiple balance updates in a single transaction
   * @param transactions Array of transactions to process
   * @returns Promise<boolean> indicating success
   */
  async topUp(
    userId: string,
    amount: number,
    source: string,
    transactionId: string,
  ): Promise<boolean> {
    return this.updateBalance(
      userId,
      amount,
      "topup",
      `Top up from ${source} (${transactionId})`,
    );
  }

  async refund(
    userId: string,
    transactionId: string,
    amount: number,
    reason: string,
  ): Promise<boolean> {
    return this.updateBalance(
      userId,
      amount,
      "refund",
      `Refund for ${transactionId}: ${reason}`,
    );
  }

  async batchUpdate(
    transactions: Array<{
      userId: string;
      amount: number;
      type: "topup" | "refund" | "usage";
      description: string;
    }>,
  ): Promise<boolean> {
    try {
      // Update Redis in batch
      await this.balanceRepository.batchUpdateRedisBalances(
        transactions.map(({ userId, amount, type }) => ({
          userId,
          amount,
          type,
        })),
      );

      // Queue async updates to ClickHouse
      const queue = await getQueue(QueueName.BalanceTransactionQueue);
      if (queue) {
        for (const tx of transactions) {
          await queue.add(QueueJobs.BalanceTransactionJob, {
            timestamp: new Date(),
            id: `${tx.userId}-${Date.now()}`,
            payload: {
              ...this.createTransaction(
                tx.userId,
                tx.amount,
                tx.type,
                tx.description,
              ),
              projectId: this.projectId,
            },
            name: QueueJobs.BalanceTransactionJob,
          });
        }
      }

      return true;
    } catch (error) {
      logger.error("Failed to batch update balances", {
        error: error instanceof Error ? error.message : error,
        transactionCount: transactions.length,
      });
      throw new Error(
        `Batch update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
