import { describe, it, expect, afterEach, vi } from "vitest";
import { checkStripeTestMode, StripeModeError } from "./stripe-mode";

describe("checkStripeTestMode", () => {
  it("accepts a test secret key", () => {
    expect(checkStripeTestMode({ STRIPE_SECRET_KEY: "sk_test_abc" })).toEqual({
      ok: true,
      secretKey: "sk_test_abc",
    });
  });

  it("accepts a test secret key with a test publishable key", () => {
    const r = checkStripeTestMode({
      STRIPE_SECRET_KEY: "sk_test_abc",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a live secret key", () => {
    const r = checkStripeTestMode({ STRIPE_SECRET_KEY: "sk_live_abc" });
    expect(r).toMatchObject({ ok: false, reason: "not_test_mode" });
  });

  it("rejects restricted keys and anything else that is not sk_test_", () => {
    for (const key of ["rk_live_abc", "rk_test_abc", "pk_test_abc", "sk_tes", "SK_TEST_abc"]) {
      expect(checkStripeTestMode({ STRIPE_SECRET_KEY: key }).ok).toBe(false);
    }
  });

  it("rejects a live publishable key even with a test secret key", () => {
    const r = checkStripeTestMode({
      STRIPE_SECRET_KEY: "sk_test_abc",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_abc",
    });
    expect(r).toMatchObject({ ok: false, reason: "not_test_mode" });
  });

  it("reports a missing key separately from a wrong one", () => {
    expect(checkStripeTestMode({})).toMatchObject({ ok: false, reason: "missing" });
    expect(checkStripeTestMode({ STRIPE_SECRET_KEY: "  " })).toMatchObject({
      ok: false,
      reason: "missing",
    });
  });

  it("never echoes key material in its message", () => {
    const r = checkStripeTestMode({ STRIPE_SECRET_KEY: "sk_live_SUPERSECRET" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain("SUPERSECRET");
  });
});

describe("getStripe / isStripeConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to build a client for a live key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    const { getStripe, isStripeConfigured } = await import("./stripe");
    expect(isStripeConfigured()).toBe(false);
    expect(() => getStripe()).toThrow(StripeModeError);
  });

  it("refuses when the publishable key is live", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_abc");
    const { getStripe, isStripeConfigured } = await import("./stripe");
    expect(isStripeConfigured()).toBe(false);
    expect(() => getStripe()).toThrow(StripeModeError);
  });

  it("builds a client for a test key (no network call)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    const { getStripe, isStripeConfigured } = await import("./stripe");
    expect(isStripeConfigured()).toBe(true);
    expect(getStripe()).toBeTruthy();
  });

  it("builds the client with a 10 s timeout and one retry, so a hung Stripe fails fast", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_timeouts");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    const { getStripe } = await import("./stripe");
    const client = getStripe() as unknown as {
      getApiField: (k: string) => unknown;
      getMaxNetworkRetries: () => number;
    };
    expect(client.getApiField("timeout")).toBe(10_000);
    expect(client.getMaxNetworkRetries()).toBe(1);
  });
});
