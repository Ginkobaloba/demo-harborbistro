import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type JWK,
} from "jose";
import {
  verifyPortalToken,
  _resetJwksCacheForTests,
  readPortalTokenConfig,
} from "./portal-token";

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

async function signFor(
  kp: KeyPair,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const claims = {
    customer_id: "cus_abc",
    role: "customer",
    ...overrides,
  };
  const audience = (overrides.aud as string | undefined) ?? AUD;
  const issuer = (overrides.iss as string | undefined) ?? ISS;
  const subject = (overrides.sub as string | undefined) ?? "drew@example.com";
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: kp.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("60m")
    .sign(kp.privateKey);
}

describe("readPortalTokenConfig", () => {
  beforeEach(() => {
    delete process.env.PORTAL_JWKS_URL;
    delete process.env.PORTAL_EXPECTED_ISSUER;
    delete process.env.PORTAL_EXPECTED_AUD;
  });

  it("throws when PORTAL_JWKS_URL is missing", () => {
    process.env.PORTAL_EXPECTED_ISSUER = ISS;
    expect(() => readPortalTokenConfig()).toThrow(/PORTAL_JWKS_URL/);
  });

  it("throws when PORTAL_EXPECTED_ISSUER is missing", () => {
    process.env.PORTAL_JWKS_URL = "https://portal.test.local/.well-known/jwks.json";
    expect(() => readPortalTokenConfig()).toThrow(/PORTAL_EXPECTED_ISSUER/);
  });

  it("defaults PORTAL_EXPECTED_AUD to harborbistro", () => {
    process.env.PORTAL_JWKS_URL = "https://portal.test.local/.well-known/jwks.json";
    process.env.PORTAL_EXPECTED_ISSUER = ISS;
    expect(readPortalTokenConfig().expectedAudience).toBe("harborbistro");
  });
});

describe("verifyPortalToken", () => {
  let active: KeyPair;
  let previous: KeyPair;
  let activeOnlyResolver: ReturnType<typeof createLocalJWKSet>;
  let rotatingResolver: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    active = await mintRsa("ps-active-1");
    previous = await mintRsa("ps-previous-1");
    activeOnlyResolver = createLocalJWKSet({ keys: [active.publicJwk] });
    rotatingResolver = createLocalJWKSet({
      keys: [active.publicJwk, previous.publicJwk],
    });
  });

  beforeEach(() => {
    _resetJwksCacheForTests();
  });

  const baseCfg = {
    jwksUrl: "https://portal.test.local/.well-known/jwks.json",
    expectedIssuer: ISS,
    expectedAudience: AUD,
  };

  it("accepts a well-formed token signed by the active key", async () => {
    const token = await signFor(active);
    const result = await verifyPortalToken(token, baseCfg, activeOnlyResolver);
    expect(result).not.toBeNull();
    expect(result?.payload.sub).toBe("drew@example.com");
    expect(result?.payload.aud).toBe(AUD);
    expect(result?.kid).toBe("ps-active-1");
  });

  it("accepts a token signed by previous key during rotation grace", async () => {
    const token = await signFor(previous);
    const result = await verifyPortalToken(token, baseCfg, rotatingResolver);
    expect(result).not.toBeNull();
    expect(result?.kid).toBe("ps-previous-1");
  });

  it("rejects a token with the wrong audience", async () => {
    const token = await signFor(active, { aud: "axlepoint" });
    expect(await verifyPortalToken(token, baseCfg, activeOnlyResolver)).toBeNull();
  });

  it("rejects a token with the wrong issuer", async () => {
    const token = await signFor(active, { iss: "https://evil.example" });
    expect(await verifyPortalToken(token, baseCfg, activeOnlyResolver)).toBeNull();
  });

  it("rejects a token signed by an unknown key", async () => {
    const rogue = await mintRsa("rogue");
    const token = await signFor(rogue);
    expect(await verifyPortalToken(token, baseCfg, activeOnlyResolver)).toBeNull();
  });

  it("rejects a token with an empty sub", async () => {
    const token = await signFor(active, { sub: "" });
    expect(await verifyPortalToken(token, baseCfg, activeOnlyResolver)).toBeNull();
  });

  it("rejects a malformed token string", async () => {
    expect(await verifyPortalToken("not.a.jwt", baseCfg, activeOnlyResolver)).toBeNull();
    expect(await verifyPortalToken("", baseCfg, activeOnlyResolver)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({ customer_id: null, role: "customer" })
      .setProtectedHeader({ alg: "RS256", kid: active.kid, typ: "JWT" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setSubject("drew@example.com")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(active.privateKey);
    expect(await verifyPortalToken(expired, baseCfg, activeOnlyResolver)).toBeNull();
  });
});
