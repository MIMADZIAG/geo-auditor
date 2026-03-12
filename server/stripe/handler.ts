/**
 * Stripe Webhook Handler & Checkout Session Creator
 */

import Stripe from "stripe";
import type { Request, Response } from "express";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { PLANS, type PlanId } from "./products";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-02-25.clover",
});

// Map Stripe Price IDs to plan names
function getPlanFromPriceId(priceId: string): PlanId | null {
  for (const [planId, plan] of Object.entries(PLANS)) {
    if (plan.stripePriceId === priceId) return planId as PlanId;
  }
  return null;
}

export async function createCheckoutSession(
  userId: number,
  userEmail: string,
  userName: string,
  planId: PlanId,
  origin: string
): Promise<{ url: string }> {
  const plan = PLANS[planId];
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  // Get or create Stripe customer
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      name: userName,
      metadata: { userId: userId.toString() },
    });
    customerId = customer.id;
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
  }

  // Build line items — use price ID if configured, otherwise create inline price
  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];

  if (plan.stripePriceId) {
    lineItems = [{ price: plan.stripePriceId, quantity: 1 }];
  } else {
    // Inline price creation (for development / before Stripe products are set up)
    lineItems = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `GEO-Auditor ${plan.name}`,
            description: plan.description,
          },
          unit_amount: plan.price,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ];
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: lineItems,
    success_url: `${origin}/dashboard?payment=success&plan=${planId}`,
    cancel_url: `${origin}/pricing?payment=cancelled`,
    allow_promotion_codes: true,
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      customer_email: userEmail,
      customer_name: userName,
      plan_id: planId,
    },
  });

  if (!session.url) throw new Error("Stripe session URL not returned");
  return { url: session.url };
}

export async function createBillingPortalSession(
  userId: number,
  origin: string
): Promise<{ url: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user?.stripeCustomerId) throw new Error("No Stripe customer found");

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/dashboard`,
  });

  return { url: session.url };
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // ⚠️ CRITICAL: Handle test events
  if (event.id.startsWith("evt_test_")) {
    console.log("[Stripe Webhook] Test event detected, returning verification response");
    res.json({ verified: true });
    return;
  }

  console.log(`[Stripe Webhook] Event: ${event.type} (${event.id})`);

  const db = await getDb();
  if (!db) {
    res.status(500).json({ error: "Database unavailable" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = parseInt(session.metadata?.user_id ?? session.client_reference_id ?? "0");
        const planId = (session.metadata?.plan_id ?? "starter") as PlanId;
        const subscriptionId = session.subscription as string;

        if (userId && planId) {
          await db.update(users)
            .set({
              plan: planId,
              stripeSubscriptionId: subscriptionId,
              planExpiresAt: null, // active subscription, no expiry
            })
            .where(eq(users.id, userId));
          console.log(`[Stripe] User ${userId} upgraded to ${planId} (sub: ${subscriptionId})`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id;
        const planId = priceId ? getPlanFromPriceId(priceId) : null;
        const status = subscription.status;

        const userRows = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
        const user = userRows[0];
        if (user) {
          if (status === "active" && planId) {
            await db.update(users)
              .set({ plan: planId, stripeSubscriptionId: subscription.id, planExpiresAt: null })
              .where(eq(users.id, user.id));
            console.log(`[Stripe] User ${user.id} subscription updated to ${planId}`);
          } else if (status === "canceled" || status === "unpaid") {
            await db.update(users)
              .set({ plan: "free", stripeSubscriptionId: null })
              .where(eq(users.id, user.id));
            console.log(`[Stripe] User ${user.id} subscription ${status} — downgraded to free`);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const userRows = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
        const user = userRows[0];
        if (user) {
          await db.update(users)
            .set({ plan: "free", stripeSubscriptionId: null })
            .where(eq(users.id, user.id));
          console.log(`[Stripe] User ${user.id} subscription deleted — downgraded to free`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        console.warn(`[Stripe] Payment failed for customer ${customerId}`);
        // Could send email notification here
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[Stripe Webhook] Processing error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
