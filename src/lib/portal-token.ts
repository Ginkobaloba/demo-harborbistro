import type { JWTVerifyGetKey } from "jose";
import {
  verifyPortalToken as verifyWithBespoke,
  readPortalTokenConfig,
  _resetJwksCacheForTests as resetBespokeCache,
  type PortalTokenConfig,
  type VerifiedPortalToken,
} from "./portal-token-bespoke";
import {
  verifySharedPortalToken,
  _resetSharedJwksCacheForTests,
} from "./portal-token-shared";

/**
 * Portal token verification -- dispatch layer (CA5 cutover).
 *
 * The default engine is the shared @paradigm-codes/auth client library (K4),
 * the same verifier every Paradigm consumer standardizes on. The pre-CA5
 * bespoke engine is preserved verbatim in ./portal-token-bespoke.ts as a
 * rollback path for one release:
 *
 *   PORTAL_VERIFIER=bespoke    # flips back without a code change or deploy
 *
 * The public API (types, env parsing, null-on-failure contract, test seams)
 * is unchanged from the bespoke module; callers and tests are agnostic to
 * which engine ran. Remove the flag and the bespoke module together once the
 * shared engine has survived a release in production.
 */

export { readPortalTokenConfig, getJwks } from "./portal-token-bespoke";
export type {
  PortalRole,
  PortalTokenPayload,
  VerifiedPortalToken,
  PortalTokenConfig,
} from "./portal-token-bespoke";

/**
 * Verify a Portal-minted JWT. Returns null on any failure, never throws.
 * Engine selection is per call, so flipping the rollback flag needs no
 * process restart.
 */
export async function verifyPortalToken(
  token: string,
  config: PortalTokenConfig = readPortalTokenConfig(),
  keyResolver?: JWTVerifyGetKey,
): Promise<VerifiedPortalToken | null> {
  if (!token || typeof token !== "string") return null;
  if (process.env.PORTAL_VERIFIER === "bespoke") {
    return verifyWithBespoke(token, config, keyResolver);
  }
  return verifySharedPortalToken(token, config, keyResolver);
}

/** Test helper: reset both engines' JWKS caches between cases. */
export function _resetJwksCacheForTests(): void {
  resetBespokeCache();
  _resetSharedJwksCacheForTests();
}
