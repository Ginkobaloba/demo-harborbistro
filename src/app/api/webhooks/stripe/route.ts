import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getWebhookSecret } from "@/lib/stripe";
import {
  WEBHOOK_SECRET_PROBLEM_MESSAGES,
  readWebhookSecretProblem,
} from "@/lib/webhook-secret";
import { handleStripeEvent } from "@/lib/stripe-webhook";

// Webhook signature verification needs the raw body and the Node.js runtime.
export const runtime = "nodejs";

let warnedUnconfigured = false;

/**
 * POST /api/webhooks/stripe
 *
 * THE GUARD, and the property it holds: order state never changes as a result
 * of an event whose signature was not verified against the configured signing
 * secret. Every inbound request is verified with `Stripe.webhooks.constructEvent`
 * against the RAW body BEFORE `handleStripeEvent` is reached; a missing,
 * malformed or wrong-key signature returns 400 having touched nothing. The
 * isolating tests in `route.test.ts` assert the whole order row is byte-for-byte
 * identical across each rejected request, not merely that the status code is 400.
 *
 * Fails closed: with STRIPE_WEBHOOK_SECRET missing -- or configured but below
 * the format/length floor in `@/lib/webhook-secret`, which is a SECONDARY
 * control against a shipped placeholder and not a substitute for the signature
 * check -- the endpoint refuses every request (503) without reading or parsing
 * the body. An unsigned event is never trusted.
 *
 * A verified event always returns 200 so Stripe does not retry needlessly.
 * Event handling is idempotent for the order row (state transitions are guarded
 * on `status = 'pending'`), so a replayed signed event is a no-op. Note there is
 * no processed-event ledger keyed on `event.id`: that idempotence is a property
 * of the SQL guards, not of replay detection.
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
        `[stripe-webhook] ${WEBHOOK_SECRET_PROBLEM_MESSAGES[readWebhookSecretProblem() ?? "missing"]}; rejecting all webhook events (503). Orders still reconcile on the confirmation page.`,
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
