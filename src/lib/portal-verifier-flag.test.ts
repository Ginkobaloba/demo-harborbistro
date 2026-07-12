import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type JWK,
} from "jose";
import { verifyPortalToken, _resetJwksCacheForTests } from "./portal-token";

/**
 * CA5 rollback-flag coverage. The main suites (portal-token.test.ts and the
 * handoff route tests) exercise the default shared engine; this file pins the
 * PORTAL_VERIFIER=bespoke escape hatch so the rollback path cannot rot
 * silently while it exists.
 */

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
  overrides: { aud?: string } = {},
): Promise<string> {
  return new SignJWT({ customer_id: "cus_flag", role: "customer" })
    .setProtectedHeader({ alg: "RS256", kid: kp.kid, typ: "JWT" })
    .setIssuer(ISS)
    .setAudience(overrides.aud ?? AUD)
    .setSubject("flag.test@example.com")
    .setIssuedAt()
    .setExpirationTime("60m")
    .sign(kp.privateKey);
}

const baseCfg = {
  jwksUrl: "https://portal.test.local/.well-known/jwks.json",
  expectedIssuer: ISS,
  expectedAudience: AUD,
};

describe("PORTAL_VERIFIER=bespoke rollback flag", () => {
  let key: KeyPair;
  let resolver: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    key = await mintRsa("flag-active-1");
    resolver = createLocalJWKSet({ keys: [key.publicJwk] });
  });

  beforeEach(() => {
    _resetJwksCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a well-formed token through the bespoke engine", async () => {
    vi.stubEnv("PORTAL_VERIFIER", "bespoke");
    const token = await signFor(key);

    const result = await verifyPortalToken(token, baseCfg, resolver);

    expect(result).not.toBeNull();
    expect(result?.payload.sub).toBe("flag.test@example.com");
    expect(result?.kid).toBe("flag-active-1");
  });

  it("rejects a wrong-audience token through the bespoke engine", async () => {
    vi.stubEnv("PORTAL_VERIFIER", "bespoke");
    const token = await signFor(key, { aud: "axlepoint" });

    expect(await verifyPortalToken(token, baseCfg, resolver)).toBeNull();
  });

  it("routes any other flag value to the shared engine", async () => {
    vi.stubEnv("PORTAL_VERIFIER", "definitely-not-bespoke");
    const token = await signFor(key);

    const result = await verifyPortalToken(token, baseCfg, resolver);

    expect(result).not.toBeNull();
    expect(result?.kid).toBe("flag-active-1");
  });
});
