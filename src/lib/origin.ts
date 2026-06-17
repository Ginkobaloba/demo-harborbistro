import type { NextRequest } from "next/server";

/**
 * Public origin for absolute URLs.
 *
 * Stripe Checkout success_url and cancel_url must be absolute and must point
 * at the real public host. request.url is NOT usable for this: the Next.js
 * standalone server binds 0.0.0.0:3000 (Dockerfile HOSTNAME) and reports that
 * as the origin, which is why an absolute redirect built from request.url
 * lands on a dead host.
 *
 * Resolution order:
 *   1. PUBLIC_BASE_URL / NEXT_PUBLIC_SITE_URL env (set this at deploy for the
 *      most reliable result).
 *   2. The forwarded/Host header. Behind the demo proxy, nginx sets
 *      `Host $host` (the real public host) and `X-Forwarded-Proto https`
 *      (Phase 0 deploy contract).
 *   3. request origin, as a last resort for direct local hits.
 */
export function publicOrigin(req: NextRequest): string {
  const env = process.env.PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, "");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host && !host.startsWith("0.0.0.0")) return `${proto}://${host}`;

  return req.nextUrl.origin;
}
