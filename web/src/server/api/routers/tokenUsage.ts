import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TokenUsageService } from "../../../../../packages/shared/src/server/services/tokenUsageService";

const tokenUsageService = new TokenUsageService();

export const tokenUsageRouter = createTRPCRouter({
  getTokenUsage: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      return tokenUsageService.getTokenUsageDetails(input.userId);
    }),
});
