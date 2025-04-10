import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { BalanceService } from "../../../../../packages/shared/src/server/services/balanceService";

const balanceService = new BalanceService();

export const balanceRouter = createTRPCRouter({
  getBalance: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      return balanceService.getBalanceDetails(input.userId);
    }),
  topupBalance: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number().positive(),
        description: z.string().optional().default("Manual topup"),
      }),
    )
    .mutation(async ({ input }) => {
      return balanceService.updateBalance(
        input.userId,
        input.amount,
        "topup",
        input.description,
      );
    }),
});
