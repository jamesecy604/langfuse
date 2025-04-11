import { NextApiRequest, NextApiResponse } from "next";
import { BalanceService } from "../../../../../packages/shared/src/server/services/balanceService";
import { stripe } from "../../../lib/stripe";
import { buffer } from "micro";
import { env } from "../../../env.mjs";
import type { Stripe } from "stripe";

export const config = {
  api: {
    bodyParser: false,
  },
};

const webhookHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"] as string;
  const body = await buffer(req);

  let event;

  try {
    if (!env.STRIPE_WEBHOOK_SIGNING_SECRET) {
      throw new Error("STRIPE_WEBHOOK_SIGNING_SECRET is not configured");
    }
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      env.STRIPE_WEBHOOK_SIGNING_SECRET,
    );
  } catch (err: any) {
    return res
      .status(400)
      .send(`Webhook Error: ${err?.message || "Unknown error"}`);
  }

  const balanceService = new BalanceService();

  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;

      if (
        session.payment_status === "paid" &&
        session.metadata?.userId &&
        session.amount_total
      ) {
        // Retrieve the payment intent ID from the checkout session
        const paymentIntent = await stripe.checkout.sessions.retrieve(
          session.id,
          {
            expand: ["payment_intent"],
          },
        );

        const paymentIntentExpanded = paymentIntent.payment_intent;
        if (
          typeof paymentIntentExpanded === "string" ||
          !paymentIntentExpanded?.id
        ) {
          console.error(
            "No valid payment intent found for checkout session:",
            session.id,
          );
          return res
            .status(400)
            .json({ error: "No valid payment intent found" });
        }
        const paymentIntentId = paymentIntentExpanded.id;

        await balanceService.topUp(
          session.metadata.userId,
          session.amount_total / 100, // Convert from cents to dollars
          "stripe",
          paymentIntentId, // Store payment intent ID instead of session ID
        );
      }
      break;
    case "charge.refunded":
      const charge = event.data.object;
      if (
        charge.metadata?.userId &&
        typeof charge.payment_intent === "string" &&
        charge.amount_refunded
      ) {
        // Ensure we pass positive amount for refunds
        const refundAmount = Math.abs(charge.amount_refunded) / 100;
        await balanceService.refund(
          charge.metadata.userId,
          charge.payment_intent,
          refundAmount,
          `Stripe refund for payment ${charge.payment_intent}`,
        );
      }
      break;
  }

  return res.status(200).json({ received: true });
};

export default webhookHandler;
