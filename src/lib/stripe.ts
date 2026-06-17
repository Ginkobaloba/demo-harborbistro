import Stripe from "stripe";

/**
 * Lazily-constructed Stripe client. Construction is deferred so that
 * `next build` (and any code path that does not actually call Stripe) does
 * not require the secret key to be present. The key is read at request time
 * from STRIPE_SECRET_KEY.
 *
 * Test mode only for this demo: the key must be an sk_test_ key.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Checkout is unavailable until the demo is run with the Stripe test key in its environment.",
    );
  }
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}

/** Whether checkout can run in this environment. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** The webhook signing secret, if configured. */
export function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET || undefined;
}
