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

/**
 * Fail fast (D-017). The SDK default is an 80 s timeout with two retries, so
 * a hung Stripe took about 241 s to surface, far past the demo proxy's 60 s
 * read timeout: the visitor got the proxy's 504, not checkout's 503. 10 s
 * with one retry answers in roughly 21 s at worst.
 */
export const STRIPE_CLIENT_OPTIONS = {
  timeout: 10_000,
  maxNetworkRetries: 1,
} as const;

export function getStripe(): Stripe {
  const mode = checkStripeTestMode(process.env);
  if (!mode.ok) {
    throw new StripeModeError(mode.message);
  }
  if (!cached || cached.key !== mode.secretKey) {
    cached = { key: mode.secretKey, client: new Stripe(mode.secretKey, STRIPE_CLIENT_OPTIONS) };
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
