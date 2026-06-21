import { describe, it, expect, beforeEach } from "vitest";
import {
  mintHarborSession,
  verifyHarborSession,
  harborSessionCookieName,
  harborSessionCookieAttributes,
} from "./portal-session";

describe("portal-session", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "a".repeat(48);
    (process.env as Record<string, string>).NODE_ENV = "test";
  });

  it("mints a verifiable session token with the right subject", async () => {
    const { token, expiresAt } = await mintHarborSession({
      email: "Drew@Example.com",
      customerId: "cus_abc",
      role: "customer",
    });
    expect(typeof token).toBe("string");
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const payload = await verifyHarborSession(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("drew@example.com");
    expect(payload?.customer_id).toBe("cus_abc");
    expect(payload?.role).toBe("customer");
    expect(payload?.src).toBe("portal");
  });

  it("rejects a session token signed with a different secret", async () => {
    const { token } = await mintHarborSession({
      email: "drew@example.com",
      customerId: null,
      role: "customer",
    });
    process.env.SESSION_SECRET = "b".repeat(48);
    expect(await verifyHarborSession(token)).toBeNull();
  });

  it("rejects junk", async () => {
    expect(await verifyHarborSession("")).toBeNull();
    expect(await verifyHarborSession("not.a.jwt")).toBeNull();
  });

  it("throws if SESSION_SECRET is too short", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(
      mintHarborSession({
        email: "x@y.z",
        customerId: null,
        role: "customer",
      }),
    ).rejects.toThrow(/SESSION_SECRET/);
  });

  it("cookie helpers return sane defaults", () => {
    expect(harborSessionCookieName()).toBe("hb_session");
    const attrs = harborSessionCookieAttributes(new Date(Date.now() + 1000));
    expect(attrs.httpOnly).toBe(true);
    expect(attrs.sameSite).toBe("lax");
    expect(attrs.path).toBe("/");
    expect(attrs.name).toBe("hb_session");
  });
});
