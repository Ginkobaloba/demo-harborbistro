/**
 * Format/length floor for STRIPE_WEBHOOK_SECRET.
 *
 * READ THIS BEFORE TRUSTING IT. This module is the SECONDARY control, not the
 * guard. What actually keeps order state safe is the HMAC signature check in
 * `src/app/api/webhooks/stripe/route.ts`: every inbound event is verified with
 * `Stripe.webhooks.constructEvent` against the RAW body before
 * `handleStripeEvent` is allowed to touch a row, and a request that fails that
 * check is rejected with the order row untouched. That is the property, and it
 * is the thing the tests in `route.test.ts` isolate.
 *
 * All this module does is refuse a value that could never be a real Stripe
 * signing secret -- a shipped placeholder, an empty-ish string, something
 * pasted into the wrong variable. It stops an ACCIDENT. It does NOTHING about
 * an attacker-chosen value that reaches configuration: `whsec_` followed by 40
 * characters the attacker picked passes every rule here, and it would then be
 * a perfectly valid HMAC key that verifies the attacker's own signatures. A
 * format check on a secret is not a security control. Do not let a later
 * reader mistake this file for the reason the endpoint is safe.
 *
 * Shape deliberately mirrors `session-secret.ts` (the repo's other secret
 * validator): a pure problem classifier plus a reader that returns the value
 * or `undefined`, so the rule can be unit-tested without an environment.
 *
 * No exact-string placeholder denylist here, on purpose, for the reason
 * spelled out at length in `session-secret.ts`: a denylist is defeated by
 * editing one character, which is exactly what a person does when told a value
 * is invalid. The `.env.example` placeholder is instead left EMPTY so it fails
 * structurally.
 */

/**
 * Stripe signing secrets are `whsec_` plus a base64-ish body; live values run
 * roughly 38-70 characters. 32 is a floor comfortably below any real value and
 * comfortably above any plausible placeholder (`whsec_xxx`, `whsec_test`).
 */
export const MIN_WEBHOOK_SECRET_LENGTH = 32;

/** Every Stripe webhook signing secret starts with this. */
export const WEBHOOK_SECRET_PREFIX = "whsec_";

export type WebhookSecretProblem = "missing" | "bad_prefix" | "too_short";

/**
 * Classify a candidate STRIPE_WEBHOOK_SECRET, or null when it clears the
 * floor. Pure: takes the value, never reads the environment, never echoes the
 * value into a message.
 */
export function webhookSecretProblem(
  value: string | undefined,
): WebhookSecretProblem | null {
  if (!value) return "missing";
  if (!value.startsWith(WEBHOOK_SECRET_PREFIX)) return "bad_prefix";
  if (value.length < MIN_WEBHOOK_SECRET_LENGTH) return "too_short";
  return null;
}

export const WEBHOOK_SECRET_PROBLEM_MESSAGES: Record<
  WebhookSecretProblem,
  string
> = {
  missing: "STRIPE_WEBHOOK_SECRET is not set",
  bad_prefix: `STRIPE_WEBHOOK_SECRET does not start with ${WEBHOOK_SECRET_PREFIX}`,
  too_short: `STRIPE_WEBHOOK_SECRET is shorter than ${MIN_WEBHOOK_SECRET_LENGTH} characters`,
};

/** The configured problem, or null when the value is usable. */
export function readWebhookSecretProblem(): WebhookSecretProblem | null {
  return webhookSecretProblem(process.env.STRIPE_WEBHOOK_SECRET);
}
