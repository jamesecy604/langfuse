import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { CostUsageService } from "@/../packages/shared/src/server/services/costUsageService";
import { CostUsageRepositoryImpl } from "@/../packages/shared/src/server/repositories/costUsageRepository";

export const llmApiKeyUsageRouter = createTRPCRouter({
  byDisplaySecretKey: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        displaySecretKey: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        provider: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const costUsageRepository = new CostUsageRepositoryImpl(
        ctx.DB,
        ctx.prisma,
      );
      const costUsageService = new CostUsageService(costUsageRepository);

      const usage = await costUsageService.getUsageByDisplaySecretKey(
        input.displaySecretKey,
        input.from,
        input.to,
        input.provider,
      );

      await auditLog({
        session: ctx.session,
        resourceType: "llmApiKey",
        resourceId: input.displaySecretKey,
        action: "readUsage",
      });

      return usage;
    }),
});
