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
  usage: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        displaySecretKey: z.string(),
        from: z.date().optional(),
        to: z.date().optional(),
        provider: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx: { prisma, session } }) => {
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

      const usage = await costUsageService.getFilteredCostUsage(
        input.projectId,
        {
          from: input.from,
          to: input.to,
          provider: input.provider,
          llmApiKeyId: input.displaySecretKey
            ? (
                await prisma.llmApiKeys.findFirst({
                  where: { displaySecretKey: input.displaySecretKey },
                  select: { id: true },
                })
              )?.id
            : undefined,
        },
      );

      await auditLog({
        session,
        resourceType: "llmApiKey",
        resourceId: input.displaySecretKey,
        action: "readUsage",
      });

      return usage;
    }),
});
