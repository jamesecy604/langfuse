import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class TokenUsageQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.TokenUsageQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.TokenUsageQueue]
  > | null {
    if (TokenUsageQueue.instance) return TokenUsageQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    TokenUsageQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.TokenUsageQueue]>(
          QueueName.TokenUsageQueue,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 5,
              delay: 60_000, // 1 minute
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    TokenUsageQueue.instance?.on("error", (err) => {
      logger.error("BalanceTransactionQueue error", err);
    });

    return TokenUsageQueue.instance;
  }
}
