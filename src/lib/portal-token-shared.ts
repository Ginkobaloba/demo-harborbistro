import {
  exportJWK,
  type JWTHeaderParameters,
  type JWTVerifyGetKey,
} from "jose";
import {
  InMemoryJwksCache,
  verifyToken,
  type Jwk,
} from "@paradigm-codes/auth";
import type {
  PortalTokenConfig,
  PortalTokenPayload,
  VerifiedPortalToken,
} from "./portal-token-bespoke";

/**
 * Shared-library portal verifier (CA5).
 *
 * Delegates signature/claim checking to @paradigm-codes/auth (the K4 client
 * library, the engine every Paradigm consumer standardizes on) and adapts it
 * onto this app's null-on-any-failure contract, so callers and tests are
 * agnostic to which engine ran.
 *
 * Documented behavioral deltas vs the bespoke engine (all safe against the
 * portal contract, which always mints kid + exp):
 *   - a token without a `kid` header is rejected (jose's remote set would
 *     have matched a single-key JWKS without one)
 *   - a token without `exp` is rejected (bespoke deferred to jose, which
 *     treats exp as optional)
 *   - on an unknown `kid` the library refetches the JWKS exactly once and
 *     then rejects, instead of jose's cooldown-gated remote-set refresh
 *
 * Test seam: the bespoke API let tests hand `verifyPortalToken` a jose
 * `JWTVerifyGetKey` (from `createLocalJWKSet`). We preserve that seam by
 * resolving the token's key through the injected resolver, exporting it back
 * to a JWK, and feeding the library a fresh per-call InMemoryJwksCache whose
 * injected `fetchJwks` returns exactly that key. No network, hermetic tests.
 */

// Match the bespoke 1h freshness window (createRemoteJWKSet cacheMaxAge).
// The library clamps TTL to its [10 min, 60 min] bounds, so this lands
// exactly on the 60-minute max. Key rotation is covered separately by the
// library's refetch-once-on-unknown-kid behavior.
const CACHE_TTL_MS = 60 * 60 * 1000;

const cachesByUrl = new Map<string, InMemoryJwksCache>();

/** Test helper: drop all shared-engine caches (mirrors the bespoke reset). */
export function _resetSharedJwksCacheForTests(): void {
  cachesByUrl.clear();
}

function cacheFor(jwksUrl: string): InMemoryJwksCache {
  let cache = cachesByUrl.get(jwksUrl);
  if (!cache) {
    cache = new InMemoryJwksCache({ jwksUri: jwksUrl, ttlMs: CACHE_TTL_MS });
    cachesByUrl.set(jwksUrl, cache);
  }
  return cache;
}

interface TokenParts {
  header: Record<string, unknown>;
  protected: string;
  payload: string;
  signature: string;
}

function decodeParts(token: string): TokenParts | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const [h, p, s] = segments;
  try {
    const header = JSON.parse(
      Buffer.from(h, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    return { header, protected: h, payload: p, signature: s };
  } catch {
    return null;
  }
}

function headerKid(parts: TokenParts): string {
  return typeof parts.header.kid === "string" ? parts.header.kid : "";
}

/**
 * Translate an injected jose key resolver into a fresh, per-call library
 * cache holding exactly the key the resolver picks for this token. Returns
 * null when the resolver cannot produce an RS256 public key (unknown kid,
 * alg mismatch, symmetric secret), matching the bespoke null contract.
 */
async function cacheFromResolver(
  config: PortalTokenConfig,
  keyResolver: JWTVerifyGetKey,
  parts: TokenParts,
): Promise<InMemoryJwksCache | null> {
  const kid = headerKid(parts);
  if (!kid) return null; // the shared engine requires kid; nothing to key the JWKS on

  let resolved: Awaited<ReturnType<JWTVerifyGetKey>>;
  try {
    resolved = await keyResolver(
      parts.header as unknown as JWTHeaderParameters,
      {
        payload: parts.payload,
        protected: parts.protected,
        signature: parts.signature,
      },
    );
  } catch {
    // e.g. jose's JWKSNoMatchingKey for an unknown kid or filtered alg.
    return null;
  }

  if (resolved instanceof Uint8Array) {
    return null; // a symmetric secret can never be an RS256 public key
  }

  let jwk: Jwk;
  try {
    const exported =
      typeof resolved === "object" && resolved !== null && "kty" in resolved
        ? (resolved as Record<string, unknown>) // resolver handed us a JWK directly
        : await exportJWK(resolved as CryptoKey);
    jwk = { ...exported, kid } as Jwk;
  } catch {
    return null; // non-exportable key material
  }

  return new InMemoryJwksCache({
    jwksUri: config.jwksUrl,
    ttlMs: CACHE_TTL_MS,
    fetchJwks: async () => [jwk],
  });
}

/**
 * Verify a Portal-minted JWT through @paradigm-codes/auth. Same contract as
 * the bespoke engine: resolves null on ANY failure, never throws. The
 * library is claim-agnostic about `sub`, so the non-empty-subject rule is
 * enforced here.
 */
export async function verifySharedPortalToken(
  token: string,
  config: PortalTokenConfig,
  keyResolver?: JWTVerifyGetKey,
): Promise<VerifiedPortalToken | null> {
  const parts = decodeParts(token);
  if (!parts) return null;

  let cache: InMemoryJwksCache;
  if (keyResolver) {
    const perCall = await cacheFromResolver(config, keyResolver, parts);
    if (!perCall) return null;
    cache = perCall;
  } else {
    cache = cacheFor(config.jwksUrl);
  }

  try {
    const claims = await verifyToken(token, {
      issuer: config.expectedIssuer,
      audience: config.expectedAudience,
      cache,
    });

    const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
    if (!sub) return null;

    return {
      payload: claims as unknown as PortalTokenPayload,
      kid: headerKid(parts),
    };
  } catch {
    return null;
  }
}
