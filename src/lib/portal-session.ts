import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { requireSessionSecret } from "./session-secret";

/**
 * App-side session (chunk 4b).
 *
 * Once verifyPortalToken accepts a Portal handoff, we mint our own
 * short-lived session JWT and stash it in an HttpOnly cookie. The Portal
 * token itself is single-use handoff material per the contract; we do not
 * persist it.
 *
 * HS256 is fine here because only Harbor signs and reads its own session.
 * Asymmetric keys would be wasted complexity for a single-tenant cookie.
 */

const COOKIE_NAME = "hb_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

export interface HarborSessionPayload extends JWTPayload {
  sub: string;
  customer_id: string | null;
  role: string;
  src: "portal";
}

function getSecret(): Uint8Array {
  // Same rule as the signed visitor cookie (session-secret.ts, D-018).
  return requireSessionSecret();
}

/**
 * Mint a session JWT for the verified Portal subject. Returns the raw
 * compact token; the caller decides where to put it (cookie, response
 * body during tests, etc).
 */
export async function mintHarborSession(args: {
  email: string;
  customerId: string | null;
  role: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const token = await new SignJWT({
    customer_id: args.customerId,
    role: args.role,
    src: "portal",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.email.toLowerCase())
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());

  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verify a session token. Returns null on any failure, including a token
 * that is validly signed but missing exp, iat, or sub.
 *
 * jose's jwtVerify checks exp/iat/nbf only when the claim is present, so a
 * hand-signed token that simply omits exp would otherwise verify forever.
 * requiredClaims closes that: a session missing sub, iat, or exp is refused
 * outright, even though mintHarborSession never produces one.
 *
 * requiredClaims alone only checks presence, not value. jose validates
 * iat's value against the clock only when maxTokenAge is set, and it never
 * relates exp to iat at all. Without more, a holder of SESSION_SECRET could
 * still hand-sign an "accepted" token with exp decades out, iat in the
 * future, iat after exp, or a fractional exp/iat. Two layers close that,
 * mirroring demo-slatewell's admin-session.ts (#38, #39):
 *   - maxTokenAge: SESSION_TTL_SECONDS makes jose itself reject an iat more
 *     than the session TTL in the past, or an iat in the future at all
 *     (zero clock tolerance; mint and verify share a process clock, so no
 *     skew to absorb).
 *   - An explicit check below requires exp - iat to be a positive integer
 *     no greater than SESSION_TTL_SECONDS. maxTokenAge bounds iat against
 *     "now" but never against exp, so it does not by itself stop a token
 *     minted this second with exp set decades out; this check does. It
 *     also rejects a fractional exp or iat, which jose accepts as long as
 *     it is a finite number.
 *
 * No issuer/audience check: mintHarborSession does not set iss/aud, so
 * requiring them here would reject every real session.
 */
export async function verifyHarborSession(
  token: string,
): Promise<HarborSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      requiredClaims: ["sub", "iat", "exp"],
      maxTokenAge: SESSION_TTL_SECONDS,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    const { exp, iat } = payload;
    if (
      typeof exp !== "number" ||
      typeof iat !== "number" ||
      !Number.isInteger(exp) ||
      !Number.isInteger(iat) ||
      exp - iat <= 0 ||
      exp - iat > SESSION_TTL_SECONDS
    ) {
      return null;
    }
    return payload as HarborSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Helpers for the cookie surface. Kept tiny so the API route does not
 * have to know the cookie name.
 */
export function harborSessionCookieName(): string {
  return COOKIE_NAME;
}

export function harborSessionCookieAttributes(expiresAt: Date) {
  return {
    name: COOKIE_NAME,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/**
 * Read the current session from the request cookies. Returns null if no
 * cookie is set or the token does not verify.
 *
 * Has zero production callers as of 2026-09-19 (confirmed by the #37 deep
 * verify and re-checked here); the portal-handoff route that would create
 * a session for this to read is itself unreached, see the note in
 * `src/app/api/auth/portal-handoff/route.ts`. Tested but not exercised;
 * do not treat a passing test here as evidence this path runs in prod.
 */
export async function readHarborSession(): Promise<HarborSessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifyHarborSession(raw);
}
