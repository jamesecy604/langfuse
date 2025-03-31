import { z } from "zod";
import { ModelCacheService } from "../../../../../packages/shared/src/server/redis/modelCache";
import type { Model, LlmApiKeys, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const cachedModelsRouter = createTRPCRouter({
  getModels: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "models:CUD",
      });

      const cache = new ModelCacheService();
      const cachedModels = await cache.getCachedModels(input.projectId);

      return cachedModels;
    }),

  getApiKeys: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const cache = new ModelCacheService();
      const cachedKeys = await cache.getCachedApiKeys(input.projectId);

      return cachedKeys;
    }),

  invalidateCache: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:update",
      });

      const cache = new ModelCacheService();
      await cache.invalidateProjectCache(input.projectId);
      return { success: true };
    }),

  syncModels: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        modelName: z.string(),
        matchPattern: z.string(),
        startDate: z.date().nullable(),
        inputPrice: z.instanceof(Decimal).nullable(),
        outputPrice: z.instanceof(Decimal).nullable(),
        totalPrice: z.instanceof(Decimal).nullable(),
        unit: z.string().nullable(),
        tokenizerId: z.string().nullable(),
        tokenizerConfig: z.custom<Prisma.JsonValue>(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "models:CUD",
      });

      const cache = new ModelCacheService();
      await cache.cacheProjectModel(input);
      return { success: true };
    }),

  syncApiKeys: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        provider: z.string(),
        adapter: z.string(),
        secretKey: z.string(),
        displaySecretKey: z.string(),
        baseURL: z.string().nullable(),
        customModels: z.array(z.string()),
        withDefaultModels: z.boolean(),
        extraHeaders: z.string().nullable(),
        extraHeaderKeys: z.array(z.string()),
        config: z.custom<Prisma.JsonValue>(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:create",
      });

      const cache = new ModelCacheService();
      await cache.cacheProjectApiKey(input);
      return { success: true };
    }),
});
