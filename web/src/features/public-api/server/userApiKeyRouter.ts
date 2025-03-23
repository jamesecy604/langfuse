import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";
import { createAndAddUserApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

export const userApiKeysRouter = createTRPCRouter({
  byProjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "userApiKeys:read",
      });

      return ctx.prisma.userApiKey.findMany({
        where: {
          projectId: input.projectId,
          userId: ctx.session.user.id,
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          lastUsedAt: true,
          note: true,
          publicKey: true,
          displaySecretKey: true,
          userId: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "userApiKeys:CUD",
      });

      const apiKeyMeta = await createAndAddUserApiKeysToDb({
        prisma: ctx.prisma,
        projectId: input.projectId,
        note: input.note,
        userId: ctx.session.user.id,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "userApiKey",
        resourceId: apiKeyMeta.id,
        action: "create",
      });

      return apiKeyMeta;
    }),
  updateNote: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        keyId: z.string(),
        note: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "userApiKeys:CUD",
      });

      await auditLog({
        session: ctx.session,
        resourceType: "userApiKey",
        resourceId: input.keyId,
        action: "update",
      });

      await ctx.prisma.userApiKey.update({
        where: {
          id: input.keyId,
          projectId: input.projectId,
          userId: ctx.session.user.id,
        },
        data: {
          note: input.note,
        },
      });

      // do not return the api key
      return;
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "userApiKeys:CUD",
      });
      await auditLog({
        session: ctx.session,
        resourceType: "userApiKey",
        resourceId: input.id,
        action: "delete",
      });

      return await new ApiAuthService(ctx.prisma, redis).deleteUserApiKey(
        input.id,
        input.userId,
      );
    }),
});
