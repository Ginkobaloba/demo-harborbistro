import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type JWK,
} from "jose";
import { handlePortalHandoff } from "./route";
import { verifyHarborSession, harborSessionCookieName } from "@/lib/portal-session";

const ISS = "https://portal.test.local";
const AUD = "harborbistro";

interface KeyPair {
  publicJwk: JWK;
  privateKey: CryptoKey;
  kid: string;
}

async function mintRsa(kid: string): Promise<KeyPair> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const pub = (await exportJWK(publicKey)) as JWK;
  pub.kid = kid;
  pub.alg = "RS256";
  pub.use = "sig";
  return { publicJwk: pub, privateKey, kid };
}

async function mint(
  kp: KeyPair,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return new SignJWT({
    customer_id: (overrides.customer_id as string | null) ?? "cus_42",
    role: (overrides.role as string) ?? "customer",
  })
    .setProtectedHeader({ alg: "RS256", kid: kp.kid, typ: "JWT" })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setSubject((overrides.sub as string) ?? "patron@example.com")
    .setIssuedAt()
    .setExpirationTime("60m")
    .sign(kp.privateKey);
}

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/portal-handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/auth/portal-handoff", () => {
  let active: KeyPair;
  let resolver: ReturnType<typeof createLocalJWKSet>;
  const cfg = {
    jwksUrl: "https://portal.test.local/.well-known/jwks.json",
    expectedIssuer: ISS,
    expectedAudience: AUD,
  };

  beforeAll(async () => {
    active = await mintRsa("ps-test-1");
    resolver = createLocalJWKSet({ keys: [active.publicJwk] });
  });

  beforeEach(() => {
    process.env.SESSION_SECRET = "x".repeat(48);
    (process.env as Record<string, string>).NODE_ENV = "test";
  });

  it("rejects a request with no JSON body", async () => {
    const res = await handlePortalHandoff(
      new Request("http://localhost/x", { method: "POST", body: "not-json" }),
      { config: cfg, keyResolver: resolver },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("bad_request");
  });

  it("rejects when token is missing", async () => {
    const res = await handlePortalHandoff(jsonReq({}), {
      config: cfg,
      keyResolver: resolver,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_token");
  });

  it("rejects an invalid token", async () => {
    const res = await handlePortalHandoff(
      jsonReq({ token: "garbage.not.jwt" }),
      { config: cfg, keyResolver: resolver },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_token");
  });

  it("accepts a valid token, sets hb_session, and returns redirect=/order", async () => {
    const token = await mint(active);
    const res = await handlePortalHandoff(jsonReq({ token }), {
      config: cfg,
      keyResolver: resolver,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/order");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${harborSessionCookieName()}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const match = setCookie.match(/hb_session=([^;]+)/);
    expect(match).not.toBeNull();
    const session = await verifyHarborSession(decodeURIComponent(match![1]));
    expect(session?.sub).toBe("patron@example.com");
    expect(session?.role).toBe("customer");
    expect(session?.customer_id).toBe("cus_42");
    expect(session?.src).toBe("portal");
  });

  it("rejects a token signed by an unknown key", async () => {
    const rogue = await mintRsa("ps-rogue");
    const token = await mint(rogue);
    const res = await handlePortalHandoff(jsonReq({ token }), {
      config: cfg,
      keyResolver: resolver,
    });
    expect(res.status).toBe(401);
  });

  it("returns 500 if env is misconfigured (no fallback config)", async () => {
    delete process.env.PORTAL_JWKS_URL;
    delete process.env.PORTAL_EXPECTED_ISSUER;
    const token = await mint(active);
    const res = await handlePortalHandoff(jsonReq({ token }), {
      keyResolver: resolver,
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("config_error");
  });

  it("falls back to role=customer when role claim missing", async () => {
    const token = await new SignJWT({ customer_id: null })
      .setProtectedHeader({ alg: "RS256", kid: active.kid, typ: "JWT" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setSubject("no-role@example.com")
      .setIssuedAt()
      .setExpirationTime("60m")
      .sign(active.privateKey);
    const res = await handlePortalHandoff(jsonReq({ token }), {
      config: cfg,
      keyResolver: resolver,
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/hb_session=([^;]+)/);
    const session = await verifyHarborSession(decodeURIComponent(match![1]));
    expect(session?.role).toBe("customer");
    expect(session?.customer_id).toBeNull();
  });
});
