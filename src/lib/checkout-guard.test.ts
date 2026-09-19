import { describe, it, expect, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// The route module imports the data layer; point it at a throwaway path. The
// guard answers before any database access, so the file is never created.
process.env.HARBOR_DB_PATH = path.join(os.tmpdir(), `harbor-checkout-guard-${process.pid}.db`);

function checkoutRequest(): NextRequest {
  return new NextRequest("http://t/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: [], customerName: "X", customerPhone: "1", fulfillment: "pickup" }),
  });
}

describe("POST /api/checkout Stripe guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses with 503 when the secret key is live", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/checkout/route");
    const res = await POST(checkoutRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/test-mode/);
  });

  it("refuses with 503 when the publishable key is live", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_abc");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/checkout/route");
    const res = await POST(checkoutRequest());
    expect(res.status).toBe(503);
  });

  it("gets past the guard with a test key (fails later on the empty cart)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    const { POST } = await import("@/app/api/checkout/route");
    const res = await POST(checkoutRequest());
    expect(res.status).toBe(400);
  });
});
