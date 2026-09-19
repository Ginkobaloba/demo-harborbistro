/**
 * Per-browser demo scope (docs/decisions.md D-016).
 *
 * Every browser gets a random 128-bit visitor id in an HttpOnly cookie on its
 * first request (src/middleware.ts). Orders and reservations the browser
 * creates are tagged with that id, and every read of visitor data (the admin
 * views, the admin actions, the public confirmation pages) is limited to the
 * fictional seed records plus the records carrying the caller's own id. One
 * visitor can never see or change what another visitor typed in.
 *
 * This module is deliberately free of Node-only imports so the edge
 * middleware can use it.
 */

export const VISITOR_COOKIE = "hb_visitor";

/**
 * Marker stored in `visitor_id` for the fictional records written by
 * scripts/seed.ts. Seed rows are visible to every visitor. NULL means
 * "legacy row, origin unknown" and is visible to nobody.
 */
export const SEED_VISITOR_ID = "seed";

/** How long the browser keeps its visitor id. Data itself expires after 24h. */
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * A visitor id is exactly a lowercase v4 UUID (122 random bits from
 * crypto.randomUUID). Anything else, including the seed marker, is rejected
 * so a crafted cookie can never claim the seed scope or an empty scope.
 */
export function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function newVisitorId(): string {
  return globalThis.crypto.randomUUID();
}

export function visitorCookieAttributes() {
  return {
    name: VISITOR_COOKIE,
    httpOnly: true as const,
    // Lax, not Strict: the return trip from Stripe Checkout is a cross-site
    // top-level GET and must carry the cookie or the confirmation page 404s.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  };
}

/** Read one cookie value from a raw Cookie header. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/** The slice of visitor data a caller may read or change. */
export type VisitorScope = {
  /** The caller's own visitor id, or null when it has none (seed only). */
  visitorId: string | null;
};

/** Seed records only. The fail-closed default for any unscoped call. */
export const SEED_ONLY: VisitorScope = Object.freeze({ visitorId: null });

export function scopeFor(visitorId: unknown): VisitorScope {
  return { visitorId: isValidVisitorId(visitorId) ? visitorId : null };
}

/** Scope from a raw Cookie header (route handlers, tests). */
export function scopeFromCookieHeader(header: string | null | undefined): VisitorScope {
  return scopeFor(readCookie(header, VISITOR_COOKIE));
}

/** Scope from a Request (route handlers). */
export function scopeFromRequest(req: Request): VisitorScope {
  return scopeFromCookieHeader(req.headers.get("cookie"));
}

/**
 * SQL predicate limiting a query to seed rows plus the caller's rows. With no
 * visitor id both placeholders bind the seed marker, so the predicate still
 * matches seed rows only. NULL (legacy) rows never match.
 */
export function scopeSql(scope: VisitorScope): { sql: string; params: [string, string] } {
  return {
    sql: "(visitor_id = ? OR visitor_id = ?)",
    params: [SEED_VISITOR_ID, scope.visitorId ?? SEED_VISITOR_ID],
  };
}

/**
 * The visitor id to tag a new record with. Normally the middleware has
 * already put one on the request; if it has not (a client that drops
 * cookies, a request the middleware matcher skipped), mint one here so no
 * record is ever written untagged. `minted` tells the caller to set the
 * cookie on its response so the browser can find the record again.
 */
export function visitorIdForWrite(req: Request): { visitorId: string; minted: boolean } {
  const existing = scopeFromRequest(req).visitorId;
  if (existing) return { visitorId: existing, minted: false };
  return { visitorId: newVisitorId(), minted: true };
}
