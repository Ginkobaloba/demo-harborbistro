import Stripe from "stripe";
import { StripeModeError, checkStripeTestMode } from "./stripe-mode";

/**
 * Lazily-constructed Stripe client. Construction is deferred so that
 * `next build` (and any code path that does not actually call Stripe) does
 * not require the secret key to be present. The key is read at request time
 * from STRIPE_SECRET_KEY.
 *
 * Test mode only: every call goes through checkStripeTestMode (stripe-mode.ts)
 * and throws StripeModeError unless the keys are test-mode keys, so a live key
 * in the environment can never reach the Stripe API.
 */
let cached: { key: string; client: Stripe } | null = null;

export function getStripe(): Stripe {
  const mode = checkStripeTestMode(process.env);
  if (!mode.ok) {
    throw new StripeModeError(mode.message);
  }
  if (!cached || cached.key !== mode.secretKey) {
    cached = { key: mode.secretKey, client: new Stripe(mode.secretKey) };
  }
  return cached.client;
}

/**
 * Whether checkout can run in this environment: a test-mode key is set. A
 * live key counts as NOT configured, so checkout answers 503 instead of
 * opening a live session.
 */
export function isStripeConfigured(): boolean {
  return checkStripeTestMode(process.env).ok;
}

/** The webhook signing secret, if configured. */
export function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET || undefined;
}
