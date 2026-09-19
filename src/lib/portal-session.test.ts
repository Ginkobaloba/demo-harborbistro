import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import {
  mintHarborSession,
  verifyHarborSession,
  harborSessionCookieName,
  harborSessionCookieAttributes,
  SESSION_TTL_SECONDS as TTL,
} from "./portal-session";

const TEST_SECRET = "a".repeat(48);

/**
 * Hand-sign a token with the repo's own secret, bypassing mintHarborSession
 * entirely, so a malformed or missing claim can be produced. Never routes
 * through the app's own minting path, which always sets every claim and so
 * cannot exercise a rejection.
 */
async function handSign(
  claims: Record<string, unknown>,
  payloadOverrides: Record<string, unknown> = {},
): Promise<string> {
  const jwt = new SignJWT({
    customer_id: null,
    role: "customer",
    src: "portal",
    ...claims,
    ...payloadOverrides,
  } as Record<string, unknown>);
  return jwt
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(new TextEncoder().encode(TEST_SECRET));
}

describe("portal-session", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = TEST_SECRET;
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

  // --- hand-signed malformed tokens: requiredClaims + maxTokenAge + the
  // explicit exp-iat bound must refuse every one of these, even though
  // mintHarborSession never produces one. Signed directly with the test
  // secret, never through mintHarborSession, so the test can actually
  // produce a claim shape the app would never mint.
  describe("hand-signed malformed tokens are refused", () => {
    it("missing exp", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({ sub: "a@b.com", iat: now });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("missing iat", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({ sub: "a@b.com", exp: now + 3600 });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("missing sub", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({ iat: now, exp: now + 3600 });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("exp far in the future (100 years, iat now)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now,
        exp: now + 100 * 365 * 24 * 60 * 60,
      });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("iat in the future", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now + 3600,
        exp: now + 3600 + TTL,
      });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("iat after exp", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now + 50,
        exp: now + 10,
      });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("fractional exp", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now,
        exp: now + 3600.5,
      });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("fractional iat (in the past, isolated from the future-iat rejection)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now - 100.5,
        exp: now + 3600,
      });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("lifetime over the TTL (iat now, exp one hour past the 12h TTL)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now,
        exp: now + TTL + 3600,
      });
      expect(await verifyHarborSession(token)).toBeNull();
    });

    it("positive control: hand-signed with every claim correct is accepted", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now,
        exp: now + TTL,
      });
      const payload = await verifyHarborSession(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe("a@b.com");
    });

    it("boundary: exp - iat exactly equal to the TTL is accepted", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now,
        exp: now + TTL,
      });
      expect(await verifyHarborSession(token)).not.toBeNull();
    });

    it("boundary: exp - iat one second over the TTL is refused", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await handSign({
        sub: "a@b.com",
        iat: now,
        exp: now + TTL + 1,
      });
      expect(await verifyHarborSession(token)).toBeNull();
    });
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
