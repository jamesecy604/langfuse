import { logger } from "../logger";
import { QueueName, QueueJobs } from "../queues";
import { getQueue } from "../redis/getQueue";
import { BalanceRepository } from "./repositories/balanceRepository";

export interface BalanceTransaction {
  projectId: string;
  transactionId: string;
  userId: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  description: string;
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
    type: "CREDIT" | "DEBIT",
    description: string,
  ): Promise<boolean>;
  getCurrentBalance(userId: string): Promise<number>;
  getBalanceDetails(userId: string): Promise<BalanceDetails>;
  batchUpdate(
    transactions: Array<{
      userId: string;
      amount: number;
      type: "CREDIT" | "DEBIT";
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
      // Fetch initial balance from ClickHouse
      const details = await this.balanceRepository.getBalanceDetails(userId);

      // Initialize Redis with the current balance
      await this.balanceRepository.initRedisBalance(
        userId,
        details.current,
        details.totalTopups,
        details.totalUsage,
      );
    } catch (error) {
      logger.error("Failed to initialize balance", { userId, error });
      throw error;
    }
  }

  private createTransaction(
    userId: string,
    amount: number,
    type: "CREDIT" | "DEBIT",
    description: string,
  ) {
    return {
      projectId: this.projectId,
      transactionId: `${userId}-${Date.now()}`,
      userId,
      amount: type === "DEBIT" ? Math.abs(amount) : amount,
      type,
      description,
    };
  }

  async updateBalance(
    userId: string,
    amount: number,
    type: "CREDIT" | "DEBIT",
    description: string,
  ) {
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
      // Update Redis first
      console.log(`[BalanceService] Updating Redis balance...`);
      await this.balanceRepository.updateRedisBalance(userId, amount, type);
      console.log(`[BalanceService] Redis balance updated successfully`);

      // Queue async update to ClickHouse
      console.log(
        `[BalanceService] Getting queue ${QueueName.BalanceTransactionQueue}...`,
      );
      const queue = await getQueue(QueueName.BalanceTransactionQueue);
      if (queue) {
        console.log(`[BalanceService] Queue found, adding job...`);
        const jobData = {
          ...transaction,
          timestamp: new Date(),
          id: `${userId}-${Date.now()}`,
        };
        console.log(`[BalanceService] Adding job to queue with data:`, jobData);
        await queue.add(QueueJobs.BalanceTransactionJob, jobData);
        console.log(`[BalanceService] Job added to queue:`, jobData);
      } else {
        console.error(
          `[BalanceService] Queue ${QueueName.BalanceTransactionQueue} not found`,
        );
      }

      return true;
    } catch (error) {
      console.error(`[BalanceService] Failed to update balance:`, error);
      logger.error("Failed to update balance", {
        userId,
        amount,
        type,
        description,
        error,
      });
      throw error;
    }
  }

  async getCurrentBalance(userId: string) {
    try {
      // Get from Redis cache first
      return await this.balanceRepository.getRedisBalance(userId);
    } catch (error) {
      logger.error("Failed to get balance", { userId, error });
      throw error;
    }
  }

  async getBalanceDetails(userId: string) {
    try {
      // Get all details from Redis
      return await this.balanceRepository.getRedisBalanceDetails(userId);
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
  async batchUpdate(
    transactions: Array<{
      userId: string;
      amount: number;
      type: "CREDIT" | "DEBIT";
      description: string;
    }>,
  ): Promise<boolean> {
    try {
      // Update Redis in batch
      await this.balanceRepository.batchUpdateRedisBalances(transactions);

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
