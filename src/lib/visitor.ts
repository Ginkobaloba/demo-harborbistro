/**
 * Per-browser demo scope (docs/decisions.md D-016), with a signed visitor
 * cookie (D-018).
 *
 * Every browser gets a random visitor id (a v4 UUID) on its first page view
 * (src/middleware.ts). Orders and reservations the browser creates are tagged
 * with that id, and every read of visitor data (the admin views, the admin
 * actions, the public confirmation pages) is limited to the fictional seed
 * records plus the records carrying the caller's own id. One visitor can
 * never see or change what another visitor typed in.
 *
 * The cookie carries the id AND a signature: `hb_visitor=<uuid>.<tag>`, where
 * `tag = base64url(HMAC-SHA-256(visitorKey, uuid))` and
 * `visitorKey = HMAC-SHA-256(SESSION_SECRET, VISITOR_KEY_LABEL)`. A cookie
 * that does not verify (unsigned, tampered, signed under another secret,
 * malformed) is never trusted: reads treat it as no visitor, writes replace
 * it with a freshly minted signed visitor. The database keeps the bare id.
 *
 * This module is deliberately free of Node-only imports (Web Crypto only) so
 * the Edge middleware verifies with exactly the same code as the routes.
 */
import { readSessionSecret } from "./session-secret";

export const VISITOR_COOKIE = "hb_visitor";

/**
 * Marker stored in `visitor_id` for the fictional records written by
 * scripts/seed.ts. Seed rows are visible to every visitor. NULL means
 * "legacy row, origin unknown" and is visible to nobody.
 */
export const SEED_VISITOR_ID = "seed";

/** How long the browser keeps its visitor id. Data itself expires after 24h. */
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID_PATTERN}$`);

/** `<v4 uuid>.<43 char base64url HMAC-SHA-256 tag>`. */
const SIGNED_VISITOR_RE = new RegExp(`^(${UUID_PATTERN})\\.([A-Za-z0-9_-]{43})$`);

/**
 * Label for the visitor-cookie key. The portal session JWT is keyed by the
 * raw secret; the visitor key is HMAC(secret, this label), so a visitor tag
 * and a session signature are always computed under different keys. The
 * version lets a future format change retire every old cookie at once.
 */
export const VISITOR_KEY_LABEL = "harborbistro:visitor-cookie:v1";

/**
 * A visitor id is exactly a lowercase v4 UUID (122 random bits from
 * crypto.randomUUID). Anything else, including the seed marker, is rejected
 * so an id can never claim the seed scope or an empty scope.
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

// --- signing (D-018) --------------------------------------------------------

const textEncoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let visitorKeyCache: { secret: string; key: Promise<CryptoKey> } | null = null;

/**
 * The HMAC key for visitor cookies, or null when SESSION_SECRET is unusable.
 * Derived once per secret value and cached (the secret only changes in tests,
 * or on a restart with a rotated env file).
 */
async function getVisitorKey(): Promise<CryptoKey | null> {
  const secret = readSessionSecret();
  if (!secret) return null;
  const secretText = new TextDecoder().decode(secret);
  if (visitorKeyCache?.secret !== secretText) {
    const subtle = globalThis.crypto.subtle;
    const key = (async () => {
      const root = await subtle.importKey(
        "raw",
        secret as Uint8Array<ArrayBuffer>,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const derived = new Uint8Array(
        await subtle.sign("HMAC", root, textEncoder.encode(VISITOR_KEY_LABEL)),
      );
      return subtle.importKey(
        "raw",
        derived,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
    })();
    visitorKeyCache = { secret: secretText, key };
  }
  return visitorKeyCache.key;
}

/** True when SESSION_SECRET is usable, i.e. visitors can be signed at all. */
export function isVisitorSigningConfigured(): boolean {
  return readSessionSecret() !== null;
}

/**
 * The signed cookie value for a visitor id, or null when SESSION_SECRET is
 * not usable (callers then refuse to mint a visitor at all).
 */
export async function signVisitorId(visitorId: string): Promise<string | null> {
  if (!isValidVisitorId(visitorId)) throw new Error("Invalid visitor id");
  const key = await getVisitorKey();
  if (!key) return null;
  const tag = new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", key, textEncoder.encode(visitorId)),
  );
  return `${visitorId}.${toBase64Url(tag)}`;
}

/**
 * The visitor id carried by a signed cookie value, or null for anything
 * else: absent, unsigned (the pre-D-018 bare UUID), tampered, signed under
 * another secret, malformed, or no usable secret. The tag is checked with
 * crypto.subtle.verify, which compares in constant time.
 */
export async function verifyVisitorCookie(
  value: string | undefined | null,
): Promise<string | null> {
  if (!value) return null;
  const match = SIGNED_VISITOR_RE.exec(value);
  if (!match) return null;
  const key = await getVisitorKey();
  if (!key) return null;
  const [, visitorId, tag] = match;
  let tagBytes: Uint8Array<ArrayBuffer>;
  try {
    tagBytes = fromBase64Url(tag);
  } catch {
    return null;
  }
  // Canonical encoding only: the last base64url char carries 2 unused bits,
  // so without this a tag with those bits flipped would also verify.
  if (tagBytes.length !== 32 || toBase64Url(tagBytes) !== tag) return null;
  const ok = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    tagBytes,
    textEncoder.encode(visitorId),
  );
  return ok ? visitorId : null;
}

// --- reading the cookie -----------------------------------------------------

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

/**
 * Scope for a bare visitor id the server already trusts (one it minted, or
 * one verifyVisitorCookie returned). Never pass a raw cookie value here; use
 * scopeFromCookieValue, which verifies the signature.
 */
export function scopeFor(visitorId: unknown): VisitorScope {
  return { visitorId: isValidVisitorId(visitorId) ? visitorId : null };
}

/** Scope from a raw `hb_visitor` cookie value. Unverified means seed only. */
export async function scopeFromCookieValue(
  value: string | null | undefined,
): Promise<VisitorScope> {
  return { visitorId: await verifyVisitorCookie(value) };
}

/** Scope from a raw Cookie header (route handlers, tests). */
export function scopeFromCookieHeader(header: string | null | undefined): Promise<VisitorScope> {
  return scopeFromCookieValue(readCookie(header, VISITOR_COOKIE));
}

/** Scope from a Request (route handlers). */
export function scopeFromRequest(req: Request): Promise<VisitorScope> {
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

// --- writes -----------------------------------------------------------------

export type VisitorForWrite =
  /** No usable SESSION_SECRET: the caller must refuse the write (503). */
  | { ok: false }
  | {
      ok: true;
      /** Bare id to store on the new record. */
      visitorId: string;
      /**
       * Signed cookie value to set on the response, or null when the request
       * already carried a valid signed cookie for this id.
       */
      cookieValue: string | null;
    };

/**
 * The visitor to tag a new record with. A validly signed cookie is used as
 * is. Anything else (no cookie, an unsigned or tampered one, one signed under
 * another secret) is never adopted: a fresh id is minted and signed, and the
 * caller sets `cookieValue` on its response so the browser can find the
 * record again. `ok: false` when there is no usable secret (D-018).
 */
export async function visitorIdForWrite(req: Request): Promise<VisitorForWrite> {
  if (!isVisitorSigningConfigured()) return { ok: false };
  const existing = (await scopeFromRequest(req)).visitorId;
  if (existing) return { ok: true, visitorId: existing, cookieValue: null };
  const visitorId = newVisitorId();
  const cookieValue = await signVisitorId(visitorId);
  if (!cookieValue) return { ok: false };
  return { ok: true, visitorId, cookieValue };
}

/** Fixed 503 body for a write refused because visitors cannot be signed. */
export const VISITOR_SIGNING_UNAVAILABLE =
  "Online ordering and reservations are temporarily unavailable in this environment.";
