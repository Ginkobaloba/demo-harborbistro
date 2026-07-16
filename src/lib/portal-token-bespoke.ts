import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/**
 * Portal token verification (chunk 4b).
 *
 * The Paradigm Portal mints short-lived RS256 JWTs for users launching
 * Harbor Bistro. We verify them locally against the portal's JWKS per
 * docs/PORTAL_GATE_CONTRACT.md in portal-shell.
 *
 * Cache strategy:
 *  - createRemoteJWKSet caches the JWKS internally for `cacheMaxAge`.
 *  - On a `kid` miss (rotation grace), jose refetches once per
 *    `cooldownDuration` and retries verification.
 *  - We default to 1h cache / 30s cooldown so a key rotation lands
 *    within a minute of publish without hammering the portal.
 */

export type PortalRole = "customer" | "staff" | "internal";

export interface PortalTokenPayload extends JWTPayload {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  customer_id?: string | null;
  role?: PortalRole;
}

export interface VerifiedPortalToken {
  payload: PortalTokenPayload;
  kid: string;
}

export interface PortalTokenConfig {
  jwksUrl: string;
  expectedIssuer: string;
  expectedAudience: string;
}

/**
 * Read config from env. Throws if any required value is missing.
 * Centralizing the read here means tests can stub env without touching
 * the consumers.
 */
export function readPortalTokenConfig(): PortalTokenConfig {
  const jwksUrl = process.env.PORTAL_JWKS_URL;
  const expectedIssuer = process.env.PORTAL_EXPECTED_ISSUER;
  const expectedAudience = process.env.PORTAL_EXPECTED_AUD ?? "harborbistro";

  if (!jwksUrl) {
    throw new Error("PORTAL_JWKS_URL is not configured");
  }
  if (!expectedIssuer) {
    throw new Error("PORTAL_EXPECTED_ISSUER is not configured");
  }
  return { jwksUrl, expectedIssuer, expectedAudience };
}

// Module-level memoization. The JWKS object itself is reusable across
// requests in a single Node process and holds its own internal cache.
let cachedKeyFn: JWTVerifyGetKey | null = null;
let cachedKeyFnFor: string | null = null;

/**
 * Build (or return cached) JWKS resolver for a given URL.
 * Exposed for tests so they can inject a fake.
 */
export function getJwks(jwksUrl: string): JWTVerifyGetKey {
  if (cachedKeyFn && cachedKeyFnFor === jwksUrl) {
    return cachedKeyFn;
  }
  cachedKeyFn = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: 60 * 60 * 1000, // 1 hour, matches portal Cache-Control
    cooldownDuration: 30 * 1000, // 30s between forced refetches on kid miss
  });
  cachedKeyFnFor = jwksUrl;
  return cachedKeyFn;
}

/**
 * Test-only escape hatch: drop the cached resolver so a different URL or
 * a freshly stubbed createRemoteJWKSet kicks in on the next call.
 */
export function _resetJwksCacheForTests(): void {
  cachedKeyFn = null;
  cachedKeyFnFor = null;
}

/**
 * Verify a Portal-minted JWT.
 *
 * Returns null on any failure (bad signature, wrong issuer, wrong audience,
 * expired, malformed). Callers respond with 401 and a generic message --
 * the contract is intentionally vague to avoid handing attackers a debug
 * channel.
 *
 * The optional `keyResolver` argument lets tests inject a local JWKS
 * without monkey-patching the network fetch.
 */
export async function verifyPortalToken(
  token: string,
  config: PortalTokenConfig = readPortalTokenConfig(),
  keyResolver?: JWTVerifyGetKey,
): Promise<VerifiedPortalToken | null> {
  if (!token || typeof token !== "string") return null;

  const resolver = keyResolver ?? getJwks(config.jwksUrl);

  try {
    const { payload, protectedHeader } = await jwtVerify(token, resolver, {
      issuer: config.expectedIssuer,
      audience: config.expectedAudience,
      algorithms: ["RS256"],
    });

    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!sub) return null;

    return {
      payload: payload as PortalTokenPayload,
      kid: typeof protectedHeader.kid === "string" ? protectedHeader.kid : "",
    };
  } catch {
    return null;
  }
}
