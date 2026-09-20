import { describe, it, expect, afterEach, vi } from "vitest";
import {
  MIN_WEBHOOK_SECRET_LENGTH,
  WEBHOOK_SECRET_PREFIX,
  readWebhookSecretProblem,
  webhookSecretProblem,
} from "./webhook-secret";
import { getWebhookSecret } from "./stripe";

/**
 * The SECONDARY control. These tests prove a placeholder-shaped value is
 * refused by calling the real functions, never by counting characters in the
 * test itself. They do NOT prove the webhook endpoint is safe -- that property
 * lives in `src/app/api/webhooks/stripe/route.test.ts`, where the signature
 * guard is the thing under test.
 */

const GOOD = `${WEBHOOK_SECRET_PREFIX}${"a".repeat(38)}`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("webhookSecretProblem", () => {
  it("accepts a whsec_ value of a realistic length", () => {
    expect(webhookSecretProblem(GOOD)).toBeNull();
  });

  it("reports missing for undefined and for empty", () => {
    expect(webhookSecretProblem(undefined)).toBe("missing");
    expect(webhookSecretProblem("")).toBe("missing");
  });

  it("reports bad_prefix for anything not starting with whsec_", () => {
    for (const value of [
      "x".repeat(48),
      "sk_test_" + "a".repeat(40),
      "WHSEC_" + "a".repeat(40),
      ` ${WEBHOOK_SECRET_PREFIX}${"a".repeat(40)}`,
    ]) {
      expect(webhookSecretProblem(value)).toBe("bad_prefix");
    }
  });

  it("reports too_short for whsec_ placeholders", () => {
    for (const value of ["whsec_xxx", "whsec_test", "whsec_short", "whsec_"]) {
      expect(webhookSecretProblem(value)).toBe("too_short");
    }
  });

  it("puts the boundary exactly at MIN_WEBHOOK_SECRET_LENGTH", () => {
    const short = `${WEBHOOK_SECRET_PREFIX}`.padEnd(
      MIN_WEBHOOK_SECRET_LENGTH - 1,
      "a",
    );
    const atLimit = `${WEBHOOK_SECRET_PREFIX}`.padEnd(
      MIN_WEBHOOK_SECRET_LENGTH,
      "a",
    );
    expect(webhookSecretProblem(short)).toBe("too_short");
    expect(webhookSecretProblem(atLimit)).toBeNull();
  });
});

describe("getWebhookSecret (the real reader, not a character count)", () => {
  it("returns the value when it clears the floor", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", GOOD);
    expect(getWebhookSecret()).toBe(GOOD);
  });

  it("returns undefined for the empty .env.example placeholder", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(getWebhookSecret()).toBeUndefined();
    expect(readWebhookSecretProblem()).toBe("missing");
  });

  it("returns undefined for a short whsec_ placeholder", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_xxx");
    expect(getWebhookSecret()).toBeUndefined();
    expect(readWebhookSecretProblem()).toBe("too_short");
  });

  it("returns undefined for a long value with no whsec_ prefix", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "x".repeat(64));
    expect(getWebhookSecret()).toBeUndefined();
    expect(readWebhookSecretProblem()).toBe("bad_prefix");
  });

  it("does NOT rescue a secret that merely looks right: shape is not authority", () => {
    // An attacker-chosen value of the correct shape passes every rule in this
    // module. That is the point of the "secondary control" label: the floor
    // filters placeholders, it does not authenticate the configuration.
    const attackerChosen = `${WEBHOOK_SECRET_PREFIX}${"0".repeat(40)}`;
    expect(webhookSecretProblem(attackerChosen)).toBeNull();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", attackerChosen);
    expect(getWebhookSecret()).toBe(attackerChosen);
  });
});
