import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getWebhookSecret } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/stripe-webhook";

// Webhook signature verification needs the raw body and the Node.js runtime.
export const runtime = "nodejs";

let warnedUnconfigured = false;

/**
 * POST /api/webhooks/stripe
 *
 * Fails closed: with no STRIPE_WEBHOOK_SECRET configured the endpoint refuses
 * every request (503) without reading or parsing the body. An unsigned event
 * is never trusted. With the secret set, the Stripe signature is verified
 * against the RAW body before the event is applied; a missing or invalid
 * signature returns 400. A verified event always returns 200 so Stripe does
 * not retry needlessly. Event handling is idempotent (state transitions are
 * guarded on `status = 'pending'`), so a replayed signed event is a no-op.
 *
 * Verification uses the static `Stripe.webhooks` helper: it is a pure HMAC
 * check and needs no API key or network access.
 */
export async function POST(req: NextRequest) {
  const secret = getWebhookSecret();
  if (!secret) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.error(
        "[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set; rejecting all webhook events (503). Orders still reconcile on the confirmation page.",
      );
    }
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    // Do not echo verifier internals back to an unauthenticated caller.
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  const result = handleStripeEvent(event);
  return NextResponse.json({ received: true, ...result });
}
