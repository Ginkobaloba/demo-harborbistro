import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/stripe-webhook";

// Webhook signature verification needs the raw body and the Node.js runtime.
export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 *
 * Verifies the Stripe signature when STRIPE_WEBHOOK_SECRET is set, then
 * applies the event. Always returns 200 for a well-formed, verified event so
 * Stripe does not retry needlessly; returns 400 for a bad signature or body.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = getWebhookSecret();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  if (secret) {
    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 },
      );
    }
    try {
      event = getStripe().webhooks.constructEvent(raw, signature, secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad signature";
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${message}` },
        { status: 400 },
      );
    }
  } else {
    // No signing secret configured (scaffold / local). Parse best-effort so
    // the endpoint still functions; production should set the secret.
    try {
      event = JSON.parse(raw) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const result = handleStripeEvent(event);
  return NextResponse.json({ received: true, ...result });
}
