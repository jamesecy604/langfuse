import type { Redis } from "ioredis";
import { prisma } from "../../db";
import { redis } from "./redis";
import type { Model, LlmApiKeys } from "@prisma/client";
import { env } from "../../env";

export class ModelCacheService {
  private redis: Redis;

  constructor() {
    if (!redis) throw new Error("Redis client not initialized");
    this.redis = redis;
  }

  async initializeCache(): Promise<void> {
    try {
      // Cache all models
      const models = await prisma.model.findMany({
        include: { Price: true },
      });

      const modelKey = `models:global`;
      await Promise.all(
        models.map((model) =>
          this.redis.hset(modelKey, model.id, JSON.stringify(model)),
        ),
      );
      await this.redis.expire(modelKey, env.TABLE_CACHE_TTL);

      // Cache all LLM API keys
      const apiKeys = await prisma.llmApiKeys.findMany();
      const apiKeyKey = `llmApiKeys:global`;
      await Promise.all(
        apiKeys.map((key: { id: string }) =>
          this.redis.hset(apiKeyKey, key.id, JSON.stringify(key)),
        ),
      );
      await this.redis.expire(apiKeyKey, env.TABLE_CACHE_TTL);

      console.log(
        `Initialized cache with ${models.length} models and ${apiKeys.length} API keys`,
      );
    } catch (error) {
      console.error("Failed to initialize cache", error);
      throw error;
    }
  }

  async getCachedModels(projectId: string): Promise<any[] | null> {
    const key = `models:global`;
    const cachedModels = await this.redis.hvals(key);
    if (cachedModels.length === 0) {
      await this.initializeCache();
      const refreshedModels = await this.redis.hvals(key);
      if (refreshedModels.length === 0) return null;
      const parsedModels = refreshedModels.map((model) => JSON.parse(model));
      return parsedModels.filter((model) => model.projectId === projectId);
    }

    const parsedModels = cachedModels.map((model) => JSON.parse(model));
    return parsedModels.filter((model) => model.projectId === projectId);
  }

  async getCachedApiKeys(projectId: string): Promise<any[] | null> {
    const key = `llmApiKeys:global`;
    const cachedKeys = await this.redis.hvals(key);
    if (cachedKeys.length === 0) {
      await this.initializeCache();
      const refreshedKeys = await this.redis.hvals(key);
      if (refreshedKeys.length === 0) return null;
      const parsedKeys = refreshedKeys.map((key) => JSON.parse(key));
      return parsedKeys.filter((key) => key.projectId === projectId);
    }

    const parsedKeys = cachedKeys.map((key) => JSON.parse(key));
    return parsedKeys.filter((key) => key.projectId === projectId);
  }

  async cacheProjectModel(model: Model): Promise<void> {
    try {
      const key = `models:global`;
      const result = await this.redis.hset(
        key,
        model.id,
        JSON.stringify(model),
      );
      await this.redis.expire(key, env.TABLE_CACHE_TTL);
      const action = result === 0 ? "Updated" : "Inserted";
      console.log(`${action} model ${model.id} in cache`);
    } catch (error) {
      console.error(`Failed to upsert model ${model.id}`, error);
    }
  }

  async cacheProjectApiKey(llmApiKey: LlmApiKeys): Promise<void> {
    try {
      const key = `llmApiKeys:global`;
      const result = await this.redis.hset(
        key,
        llmApiKey.id,
        JSON.stringify(llmApiKey),
      );
      await this.redis.expire(key, env.TABLE_CACHE_TTL);
      const action = result === 0 ? "Updated" : "Inserted";
      console.log(`${action} LLM API key ${llmApiKey.id} in cache`);
    } catch (error) {
      console.error(`Failed to upsert LLM API key ${llmApiKey.id}`, error);
    }
  }

  async invalidateProjectCache(projectId: string): Promise<void> {
    try {
      const modelKey = `models:${projectId}`;
      const apiKey = `llmApiKeys:${projectId}`;

      await Promise.all([this.redis.del(modelKey), this.redis.del(apiKey)]);

      console.log(`Invalidated cache for project ${projectId}`);
    } catch (error) {
      console.error(
        `Failed to invalidate cache for project ${projectId}`,
        error,
      );
    }
  }
}
