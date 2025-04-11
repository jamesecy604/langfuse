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
        paymentIntentId: t.paymentIntentId,
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
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { transactionId, amount, reason } = input;
      const userId = ctx.session.user.id;

      // First get the original transaction to refund
      const balanceService = new BalanceService();
      const transactions = await balanceService.getTransactions(userId);
      const transactionToRefund = transactions.find(
        (t) => t.transactionId === transactionId,
      );

      if (!transactionToRefund) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transaction not found",
        });
      }

      if (!transactionToRefund.paymentIntentId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Original transaction has no payment intent ID",
        });
      }

      const paymentIntentId = transactionToRefund.paymentIntentId;
      console.log(
        "--------------------Attempting refund with paymentIntentId:",
        paymentIntentId,
      );

      // Create Stripe refund
      try {
        // First verify the payment intent exists and is refundable
        let paymentIntent: Stripe.PaymentIntent;
        try {
          console.log(
            "---------------------Retrieving payment intent from Stripe...",
          );
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          console.log("-----------------------Retrieved payment intent:", {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            amount_refunded: (paymentIntent as any).amount_refunded || 0,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("No such payment_intent")
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Invalid payment intent ID - please check the ID and try again",
            });
          }
          throw error;
        }

        if (paymentIntent.status !== "succeeded") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Payment intent status is ${paymentIntent.status} - must be 'succeeded' to refund`,
          });
        }

        const paymentIntentWithRefunds =
          paymentIntent as Stripe.PaymentIntent & {
            amount_refunded: number;
          };
        const refundableAmount =
          paymentIntentWithRefunds.amount -
          (paymentIntentWithRefunds.amount_refunded || 0);
        if (Math.round(Math.abs(amount) * 100) > refundableAmount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Refund amount exceeds available balance (${refundableAmount / 100} available)`,
          });
        }

        console.log("--------------Creating refund with params:", {
          payment_intent: paymentIntentId,
          amount: Math.round(Math.abs(amount) * 100),
          reason: reason || undefined,
        });

        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          amount: Math.round(Math.abs(amount) * 100), // Convert to cents and ensure positive
          reason: reason
            ? (reason as Stripe.RefundCreateParams.Reason)
            : undefined,
          metadata: {
            userId,
            originalTransactionId: transactionId,
          },
        });

        console.log(
          "------------------------Successfully created Stripe refund:",
          {
            id: refund.id,
            status: refund.status,
            amount: refund.amount,
          },
        );
        // Process balance refund after successful Stripe refund
        try {
          await balanceService.refund(
            userId,
            transactionId,
            amount,
            `${reason || ""} (Stripe refund for ${paymentIntentId})`,
          );
          console.log("Successfully processed balance refund");
          return refund;
        } catch (error) {
          console.error("Failed to process balance refund:", error);
          // Rollback Stripe refund if balance refund fails
          try {
            await stripe.refunds.cancel(refund.id);
            console.log(
              "Rolled back Stripe refund due to balance refund failure",
            );
          } catch (rollbackError) {
            console.error("Failed to rollback Stripe refund:", rollbackError);
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Refund processed with Stripe but failed to update balance",
            cause: error,
          });
        }
      } catch (error) {
        console.error("Failed to create Stripe refund:", error);
        let message = "Failed to process refund with Stripe";
        if (error instanceof Error) {
          message += `: ${error.message}`;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message,
          cause: error,
        });
      }
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
