import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";

export const cloudUsageMeteringQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudUsageMeteringJob) {
    logger.warn(
      "Cloud Usage Metering is an Enterprise Edition feature - skipping job execution",
    );
  }
};
