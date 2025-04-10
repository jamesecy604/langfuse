import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { stripe } from "../../../lib/stripe";
import { TRPCError } from "@trpc/server";
import { BalanceService } from "../../../../../packages/shared/src/server/services/balanceService";
export const paymentsRouter = createTRPCRouter({
  getTransactions: protectedProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { from, to } = input;
      const userId = ctx.session.user.id;

      const balanceService = new BalanceService();
      const transactions = await balanceService.getTransactions(
        userId,
        from,
        to,
      );

      return transactions.map((t) => ({
        id: t.transactionId,
        amount: t.amount,
        type: t.type,
        timestamp: t.timestamp,
        description: t.description,
      }));
    }),

  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        amount: z.number().min(1),
        currency: z.string().default("usd"),
        successUrl: z.string(),
        cancelUrl: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { amount, currency, successUrl, cancelUrl } = input;
      const userId = ctx.session.user.id;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: "Top Up Balance",
              },
              unit_amount: amount * 100, // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          type: "topup",
        },
      });

      if (!session.url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create Stripe checkout session",
        });
      }

      return { url: session.url };
    }),

  refund: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        amount: z.number().min(1),
        reason: z.string().default(""),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { transactionId, amount, reason } = input;
      const userId = ctx.session.user.id;

      const balanceService = new BalanceService();
      await balanceService.refund(userId, transactionId, amount, reason || "");

      return { success: true };
    }),
});
