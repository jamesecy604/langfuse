import "./initialize";

import express from "express";
import cors from "cors";
import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import { batchExportQueueProcessor } from "./queues/batchExportQueue";
import { onShutdown } from "./utils/shutdown";

import helmet from "helmet";
import { WorkerManager } from "./queues/workerManager";
import {
  CoreDataS3ExportQueue,
  DataRetentionQueue,
  MeteringDataPostgresExportQueue,
  PostHogIntegrationQueue,
  QueueName,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "./env";
import { ingestionQueueProcessorBuilder } from "./queues/ingestionQueue";
import { BackgroundMigrationManager } from "./backgroundMigrations/backgroundMigrationManager";

import { traceDeleteProcessor } from "./queues/traceDelete";
import { projectDeleteProcessor } from "./queues/projectDelete";
import { coreDataS3ExportProcessor } from "./queues/coreDataS3ExportQueue";

import { batchActionQueueProcessor } from "./queues/batchActionQueue";
import { scoreDeleteProcessor } from "./queues/scoreDelete";
import { BalanceWorkerService } from "./services/BalanceWorkerService";
import { TokenUsageWorkerService } from "./services/TokenUsageWorkerService";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.get<{}, MessageResponse>("/", (req, res) => {
  res.json({
    message: "Langfuse Worker API 🚀",
  });
});

app.use("/api", api);

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

if (env.LANGFUSE_ENABLE_BACKGROUND_MIGRATIONS === "true") {
  // Will start background migrations without blocking the queue workers
  BackgroundMigrationManager.run().catch((err) => {
    logger.error("Error running background migrations", err);
  });
}

if (env.LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  CoreDataS3ExportQueue.getInstance();
  WorkerManager.register(
    QueueName.CoreDataS3ExportQueue,
    coreDataS3ExportProcessor,
  );
}

if (env.QUEUE_CONSUMER_TRACE_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.TraceDelete, traceDeleteProcessor, {
    concurrency: env.LANGFUSE_TRACE_DELETE_CONCURRENCY,
    limiter: {
      // Process at most `max` delete jobs per 15 seconds
      max: env.LANGFUSE_TRACE_DELETE_CONCURRENCY,
      duration: 15_000,
    },
  });
}

if (env.QUEUE_CONSUMER_SCORE_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.ScoreDelete, scoreDeleteProcessor, {
    concurrency: env.LANGFUSE_SCORE_DELETE_CONCURRENCY,
    limiter: {
      // Process at most `max` delete jobs per 15 seconds
      max: env.LANGFUSE_SCORE_DELETE_CONCURRENCY,
      duration: 15_000,
    },
  });
}

if (env.QUEUE_CONSUMER_PROJECT_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.ProjectDelete, projectDeleteProcessor, {
    concurrency: env.LANGFUSE_PROJECT_DELETE_CONCURRENCY,
    limiter: {
      // Process at most `max` delete jobs per 3 seconds
      max: env.LANGFUSE_PROJECT_DELETE_CONCURRENCY,
      duration: 3_000,
    },
  });
}

if (env.QUEUE_CONSUMER_BATCH_EXPORT_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.BatchExport, batchExportQueueProcessor, {
    concurrency: 1, // only 1 job at a time
    limiter: {
      // execute 1 batch export in 5 seconds to avoid overloading the DB
      max: 1,
      duration: 5_000,
    },
  });
}

if (env.QUEUE_CONSUMER_BATCH_ACTION_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.BatchActionQueue,
    batchActionQueueProcessor,
    {
      concurrency: 1, // only 1 job at a time
      limiter: {
        max: 1,
        duration: 5_000,
      },
    },
  );
}

if (env.QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.IngestionQueue,
    ingestionQueueProcessorBuilder(true), // this might redirect to secondary queue
    {
      concurrency: env.LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY,
    },
  );
}

if (env.QUEUE_CONSUMER_INGESTION_SECONDARY_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.IngestionSecondaryQueue,
    ingestionQueueProcessorBuilder(false),
    {
      concurrency:
        env.LANGFUSE_INGESTION_SECONDARY_QUEUE_PROCESSING_CONCURRENCY,
    },
  );
}

// Register balance transaction queue worker
WorkerManager.register(
  QueueName.BalanceTransactionQueue,
  (job) => {
    logger.info(`Processing balance transaction job ${job.id}`, {
      jobData: job.data,
    });
    try {
      const result = new BalanceWorkerService().processQueue(job);

      logger.info(`Successfully processed balance transaction job ${job.id}`);
      return result;
    } catch (error) {
      logger.error(
        `Failed to process balance transaction job ${job.id}`,
        error,
      );
      throw error;
    }
  },
  {
    concurrency: 1, // Only process one balance transaction at a time
  },
);

// Register token usage queue worker
WorkerManager.register(
  QueueName.TokenUsageQueue,
  (job) => {
    logger.info(`Processing token usage job ${job.id}`, {
      jobData: job.data,
    });
    try {
      const result = new TokenUsageWorkerService().processQueue(job);

      logger.info(`Successfully processed token usage job ${job.id}`);
      return result;
    } catch (error) {
      logger.error(`Failed to process token usage job ${job.id}`, error);
      throw error;
    }
  },
  {
    concurrency: 1, // Only process one token usage at a time
  },
);

process.on("SIGINT", () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

export default app;
