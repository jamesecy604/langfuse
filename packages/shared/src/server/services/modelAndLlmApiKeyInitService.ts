import { ModelCacheService } from "../redis/modelCache";
import { prisma } from "../../db";
import { redis } from "../redis/redis";
import type { Model, LlmApiKeys } from "@prisma/client";

export class ModelAndLlmApiKeyInitService {
  private modelCacheService: ModelCacheService;

  constructor() {
    if (!redis) throw new Error("Redis client not initialized");
    this.modelCacheService = new ModelCacheService();
  }

  async initialize(): Promise<void> {
    try {
      await this.modelCacheService.initializeCache();
      console.log("Initialized models and LLM API keys cache");
    } catch (error) {
      console.error(
        "Failed to initialize models and LLM API keys cache",
        error,
      );
      throw error;
    }
  }
}
