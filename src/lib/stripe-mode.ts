/**
 * Stripe test-mode guard. This demo must never touch a live Stripe account,
 * so the server refuses every Stripe call unless the configured keys are
 * test-mode keys:
 *
 *   - STRIPE_SECRET_KEY must start with `sk_test_`.
 *   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, if set, must start with `pk_test_`.
 *
 * Kept in its own module (pure, env passed in) so it is easy to review and
 * unit-test. The webhook route is unchanged: it already fails closed on a
 * missing signing secret and verifies every signature, and the events it
 * applies can only reference orders created through a guarded checkout.
 */

export const TEST_SECRET_PREFIX = "sk_test_";
export const TEST_PUBLISHABLE_PREFIX = "pk_test_";

export type StripeEnv = {
  [name: string]: string | undefined;
  STRIPE_SECRET_KEY?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
};

export type StripeModeResult =
  | { ok: true; secretKey: string }
  | { ok: false; reason: "missing" | "not_test_mode"; message: string };

/** Raised by getStripe() when the configured keys are not test-mode keys. */
export class StripeModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeModeError";
  }
}

/**
 * Check the Stripe keys in `env`. Never echoes key material in the message,
 * only which variable is wrong.
 */
export function checkStripeTestMode(env: StripeEnv): StripeModeResult {
  const secret = env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return {
      ok: false,
      reason: "missing",
      message:
        "STRIPE_SECRET_KEY is not set. Checkout is unavailable until the demo is run with the Stripe test key in its environment.",
    };
  }
  if (!secret.startsWith(TEST_SECRET_PREFIX)) {
    return {
      ok: false,
      reason: "not_test_mode",
      message: `Refusing to use Stripe: STRIPE_SECRET_KEY is not a test-mode key (it must start with ${TEST_SECRET_PREFIX}). This demo never runs against a live Stripe account.`,
    };
  }
  const publishable = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (publishable && !publishable.startsWith(TEST_PUBLISHABLE_PREFIX)) {
    return {
      ok: false,
      reason: "not_test_mode",
      message: `Refusing to use Stripe: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not a test-mode key (it must start with ${TEST_PUBLISHABLE_PREFIX}).`,
    };
  }
  return { ok: true, secretKey: secret };
}
