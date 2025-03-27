import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class BalanceTransactionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.BalanceTransactionQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.BalanceTransactionQueue]
  > | null {
    if (BalanceTransactionQueue.instance)
      return BalanceTransactionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    BalanceTransactionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.BalanceTransactionQueue]>(
          QueueName.BalanceTransactionQueue,
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

    BalanceTransactionQueue.instance?.on("error", (err) => {
      logger.error("BalanceTransactionQueue error", err);
    });

    return BalanceTransactionQueue.instance;
  }
}
