import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
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

  all: protectedProjectProcedure
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

  metrics: protectedProjectProcedure
    .input(
      z.object({
        llmApiKeyIds: z.array(z.string().min(1)),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await getLLMApiKeyMetrics(input.llmApiKeyIds, input.filter ?? []);
    }),
});
