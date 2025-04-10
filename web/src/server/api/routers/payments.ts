import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { stripe } from "../../../lib/stripe";
import { TRPCError } from "@trpc/server";
import type { Stripe } from "stripe";
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

      try {
        const sessionParams: Stripe.Checkout.SessionCreateParams = {
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency,
                product_data: { name: "Top Up Balance" },
                unit_amount: amount,
              },
              quantity: 1,
            },
          ],
          mode: "payment" as const,
          success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          metadata: { userId, type: "topup" },
        };

        const session = await stripe.checkout.sessions.create(sessionParams);

        if (!session.url) {
          console.error("Stripe session created but URL is missing");
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create Stripe checkout session",
          });
        }

        console.log(
          "Successfully created Stripe checkout session:",
          session.id,
        );
        return { url: session.url };
      } catch (error) {
        console.error("Error creating Stripe checkout session:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create checkout session",
          cause: error,
        });
      }
    }),

  refund: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        amount: z.number(),
        reason: z.string().default(""),
        paymentIntentId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { transactionId, amount, reason, paymentIntentId } = input;
      const userId = ctx.session.user.id;

      // Create Stripe refund if paymentIntentId is provided
      if (paymentIntentId) {
        try {
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: Math.round(Math.abs(amount) * 100), // Convert to cents and ensure positive
            reason: reason
              ? (reason as Stripe.RefundCreateParams.Reason)
              : undefined,
          });
        } catch (error) {
          console.error("Failed to create Stripe refund:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process refund with Stripe",
          });
        }
      }

      const balanceService = new BalanceService();
      await balanceService.refund(userId, transactionId, amount, reason || "");

      return { success: true };
    }),

  createPaymentIntent: protectedProcedure
    .input(
      z.object({
        amount: z.number().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { amount } = input;
      const userId = ctx.session.user.id;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency: "usd",
        metadata: {
          userId,
          type: "topup",
        },
      });

      if (!paymentIntent.client_secret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create payment intent",
        });
      }

      return { clientSecret: paymentIntent.client_secret };
    }),
});
