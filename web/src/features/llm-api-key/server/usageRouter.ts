import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { CostUsageService } from "../../../../../packages/shared/src/server/services/costUsageService";
import { CostUsageRepositoryImpl } from "../../../../../packages/shared/src/server/repositories/costUsageRepository";
import { clickhouseClient } from "../../../../../packages/shared/src/server/clickhouse/client";

export const llmApiKeyUsageRouter = createTRPCRouter({
  providers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx: { prisma, session } }) => {
      throwIfNoProjectAccess({
        session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const providers = await prisma.llmApiKeys.findMany({
        where: { projectId: input.projectId },
        distinct: ["provider"],
        select: { provider: true },
        orderBy: { provider: "asc" },
      });

      return providers.map((p) => p.provider);
    }),

  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx: { prisma, session } }) => {
      throwIfNoProjectAccess({
        session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const apiKeys = await prisma.llmApiKeys.findMany({
        where: { projectId: input.projectId },
        select: { displaySecretKey: true },
      });

      return apiKeys;
    }),

  usage: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        displaySecretKey: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        provider: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx: { prisma, session } }) => {
      console.log("==============================Received date range:", {
        from: input.from?.toISOString(),
        to: input.to?.toISOString(),
      });
      throwIfNoProjectAccess({
        session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const costUsageRepository = new CostUsageRepositoryImpl(
        clickhouseClient(),
        prisma,
      );
      const costUsageService = new CostUsageService(costUsageRepository);

      const llmApiKeyId = input.displaySecretKey
        ? (
            await prisma.llmApiKeys.findFirst({
              where: { displaySecretKey: input.displaySecretKey },
              select: { id: true },
            })
          )?.id
        : undefined;

      const usage = await costUsageService.getFilteredCostUsage(
        input.projectId,
        {
          from: input.from,
          to: input.to,
          provider: input.provider,
          llmApiKeyId,
        },
      );

      if (input.displaySecretKey) {
        await auditLog({
          session,
          resourceType: "llmApiKey",
          resourceId: input.displaySecretKey,
          action: "readUsage",
        });
      }

      return usage;
    }),
});
