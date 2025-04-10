import { NextApiRequest, NextApiResponse } from "next";
import { BalanceService } from "../../../../../packages/shared/src/server/services/balanceService";
import { stripe } from "../../../lib/stripe";
import { buffer } from "micro";
import { env } from "../../../env.mjs";

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
        await balanceService.topUp(
          session.metadata.userId,
          session.amount_total / 100, // Convert from cents to dollars
          "stripe",
          session.id,
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
        await balanceService.refund(
          charge.metadata.userId,
          charge.payment_intent,
          charge.amount_refunded / 100, // Convert from cents to dollars
          "Stripe refund",
        );
      }
      break;
  }

  return res.status(200).json({ received: true });
};

export default webhookHandler;
