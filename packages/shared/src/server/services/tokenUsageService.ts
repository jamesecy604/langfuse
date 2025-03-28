import { logger } from "../logger";
import { QueueName, QueueJobs } from "../queues";
import { getQueue } from "../redis/getQueue";
import { TokenUsageRepository } from "./repositories/tokenUsageRepository";
import crypto from "crypto";
import { prisma } from "../../db";

export interface TokenUsageTransaction {
  projectId: string;
  transactionId: string;
  llmApiKeyId: string;
  tokens: number;
  cost: number | null;
  description: string;
}

interface TokenUsageDetails {
  tokens: number;
  cost: number | null;
  updatedAt: Date | null;
}

export interface ITokenUsageService {
  initTokenUsage(llmApiKeyId: string): Promise<void>;
  updateTokenUsage(
    llmApiKeyId: string,
    tokens: number,
    cost: number | null,
    description: string,
  ): Promise<boolean>;
  getCurrentTokenUsage(llmApiKeyId: string): Promise<number | null>;
  getTokenUsageDetails(llmApiKeyId: string): Promise<TokenUsageDetails | null>;
  batchUpdate(
    transactions: Array<{
      llmApiKeyId: string;
      tokens: number;
      cost: number | null;
      description: string;
    }>,
  ): Promise<boolean>;
  chooseLLMApiKeyId(apiKeyIds: string[]): Promise<string | null>;
}

export class TokenUsageService implements ITokenUsageService {
  constructor(
    private tokenUsageRepository: TokenUsageRepository = new TokenUsageRepository(),
    private projectId: string = "default",
  ) {}

  async chooseLLMApiKeyId(apiKeyIds: string[]): Promise<string | null> {
    try {
      return await this.tokenUsageRepository.chooseLLMApiKeyId(apiKeyIds);
    } catch (error) {
      logger.error("Failed to choose LLM API key", { apiKeyIds, error });
      throw error;
    }
  }

  private initMutex = new Map<string, Promise<void>>();

  async initTokenUsage(llmApiKeyId: string): Promise<void> {
    try {
      if (this.initMutex.has(llmApiKeyId)) {
        return this.initMutex.get(llmApiKeyId);
      }

      const initPromise = (async () => {
        logger.info("Initializing token usage", { llmApiKeyId });
        const details =
          await this.tokenUsageRepository.getTokenUsageDetails(llmApiKeyId);
        logger.debug("ClickHouse token usage details", {
          llmApiKeyId,
          details,
        });

        await this.tokenUsageRepository.initRedisTokenUsage(
          llmApiKeyId,
          details.tokens,
          details.cost,
        );
        logger.info("Redis token usage initialized", { llmApiKeyId });
      })();

      this.initMutex.set(llmApiKeyId, initPromise);
      await initPromise;
      this.initMutex.delete(llmApiKeyId);
    } catch (error) {
      logger.error("Failed to initialize token usage", { llmApiKeyId, error });
      throw error;
    }
  }

  private createTransaction(
    llmApiKeyId: string,
    tokens: number,
    cost: number | null,
    description: string,
  ): TokenUsageTransaction {
    const generateUUID = () => {
      try {
        return crypto.randomUUID();
      } catch (e) {
        return crypto.randomBytes(16).toString("hex");
      }
    };

    return {
      projectId: this.projectId,
      transactionId: generateUUID(),
      llmApiKeyId,
      tokens,
      cost,
      description,
    };
  }

  async updateTokenUsage(
    llmApiKeyId: string,
    tokens: number,
    cost: number | null,
    description: string,
  ): Promise<boolean> {
    logger.info("Updating token usage", {
      llmApiKeyId,
      tokens,
      cost,
      description,
    });
    const transaction = this.createTransaction(
      llmApiKeyId,
      tokens,
      cost,
      description,
    );

    try {
      const currentTokens =
        await this.tokenUsageRepository.getRedisTokenUsage(llmApiKeyId);
      if (currentTokens === null) {
        logger.info("Redis token usage missing/expired, initializing from DB", {
          llmApiKeyId,
        });
        await this.initTokenUsage(llmApiKeyId);
      }

      const newTokens = await this.tokenUsageRepository.updateRedisTokenUsage(
        llmApiKeyId,
        tokens,
        cost,
      );

      if (newTokens === null) {
        throw new Error("Redis token usage update failed - returned null");
      }

      const queue = await getQueue(QueueName.TokenUsageQueue);
      if (!queue) {
        throw new Error(`Queue ${QueueName.TokenUsageQueue} not found`);
      }

      await queue.add(QueueJobs.TokenUsageJob, {
        ...transaction,
        timestamp: new Date(),
        id: crypto.randomUUID(),
      });
      return true;
    } catch (error) {
      logger.error("Failed to update token usage", {
        llmApiKeyId,
        tokens,
        cost,
        description,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async getCurrentTokenUsage(llmApiKeyId: string): Promise<number | null> {
    try {
      const usage =
        await this.tokenUsageRepository.getRedisTokenUsage(llmApiKeyId);
      if (usage === null) {
        await this.initTokenUsage(llmApiKeyId);
        const newUsage =
          await this.tokenUsageRepository.getRedisTokenUsage(llmApiKeyId);
        return newUsage?.tokens ?? null;
      }
      return usage.tokens;
    } catch (error) {
      logger.error("Failed to get token usage", { llmApiKeyId, error });
      throw error;
    }
  }

  async getTokenUsageDetails(
    llmApiKeyId: string,
  ): Promise<TokenUsageDetails | null> {
    try {
      const details =
        await this.tokenUsageRepository.getRedisTokenUsageDetails(llmApiKeyId);
      if (details === null) {
        await this.initTokenUsage(llmApiKeyId);
        const newDetails =
          await this.tokenUsageRepository.getRedisTokenUsageDetails(
            llmApiKeyId,
          );
        return newDetails;
      }
      return details;
    } catch (error) {
      logger.error("Failed to get token usage details", { llmApiKeyId, error });
      throw error;
    }
  }

  async batchUpdate(
    transactions: Array<{
      llmApiKeyId: string;
      tokens: number;
      cost: number | null;
      description: string;
    }>,
  ): Promise<boolean> {
    try {
      await this.tokenUsageRepository.batchUpdateRedisTokenUsage(
        transactions.map(({ llmApiKeyId, tokens, cost }) => ({
          llmApiKeyId,
          tokens,
          cost,
        })),
      );

      const queue = await getQueue(QueueName.TokenUsageQueue);
      if (!queue) {
        throw new Error(`Queue ${QueueName.TokenUsageQueue} not found`);
      }

      await Promise.all(
        transactions.map((tx) =>
          queue.add(QueueJobs.TokenUsageJob, {
            timestamp: new Date(),
            id: crypto.randomUUID(),
            payload: {
              ...this.createTransaction(
                tx.llmApiKeyId,
                tx.tokens,
                tx.cost,
                tx.description,
              ),
              projectId: this.projectId,
            },
            name: QueueJobs.TokenUsageJob,
          }),
        ),
      );
      return true;
    } catch (error) {
      logger.error("Failed to batch update token usage", {
        error: error instanceof Error ? error.message : String(error),
        transactionCount: transactions.length,
      });
      return false;
    }
  }
}
