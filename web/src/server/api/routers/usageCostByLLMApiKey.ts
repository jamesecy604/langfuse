import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, singleFilter } from "@langfuse/shared";
import {
  getTotalLLMApiKeyCount,
  getLLMApiKeyMetrics,
  hasAnyLLMApiKey,
  getUsageGroupedByLLMApiKeys,
} from "@langfuse/shared/src/server";
const LlmApiKeyFilterOptions = z.object({
  filter: z.array(singleFilter).nullable(),
  searchQuery: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
});

const LlmApiKeyAllOptions = LlmApiKeyFilterOptions.extend({
  ...paginationZod,
});

export const usageCostByLLMApiKeyRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure.input(z.object({})).query(async () => {
    return await hasAnyLLMApiKey();
  }),

  all: protectedProcedure
    .input(LlmApiKeyAllOptions)
    .query(async ({ input, ctx }) => {
      const [usageList, totalCount] = await Promise.all([
        getUsageGroupedByLLMApiKeys(
          input.filter ?? [],
          input.searchQuery ?? undefined,
          input.limit,
          input.page,
        ),
        getTotalLLMApiKeyCount(
          input.filter ?? [],
          input.searchQuery ?? undefined,
        ),
      ]);

      return {
        totalCount,
        usageList,
      };
    }),

  metrics: protectedProcedure
    .input(
      z.object({
        llmApiKeyIds: z.array(z.string().min(1)),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const metrics = await getLLMApiKeyMetrics(
        input.llmApiKeyIds,
        input.filter ?? [],
      );

      // Get API key details from PostgreSQL
      const apiKeys = await ctx.prisma.llmApiKeys.findMany({
        where: {
          id: { in: input.llmApiKeyIds },
        },
        select: {
          id: true,
          displaySecretKey: true,
          deletedAt: true,
          createdAt: true,
          projectId: true,
          project: {
            select: {
              name: true,
            },
          },
        },
      });

      return metrics.map((metric) => {
        const apiKey = apiKeys.find(
          (k: { id: string }) => k.id === metric.llmApiKeyId,
        );
        return {
          ...metric,
          displaySecretKey: apiKey?.displaySecretKey,
          deletedAt: apiKey?.deletedAt,
          createdAt: apiKey?.createdAt,
          projectId: apiKey?.projectId,
          projectName: apiKey?.project?.name,
        };
      });
    }),
});
