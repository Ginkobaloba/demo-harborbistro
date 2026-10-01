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
 *      most reliable result). It may hold SEVERAL comma-separated origins,
 *      for a host move where the demo answers on two names at once
 *      (harborbistro.paradigm.codes and harborbistro.projectnexuscode.org,
 *      2026-10). When the request's forwarded/Host header names one of them,
 *      that origin wins, so a visitor returns from Stripe to the host they
 *      left from. Otherwise the FIRST entry is used. A Host header that is not
 *      in the list never becomes the origin while the env is set, so the
 *      allowlist cannot be widened by a client.
 *   2. The forwarded/Host header. Behind the demo proxy, nginx sets
 *      `Host $host` (the real public host) and `X-Forwarded-Proto https`
 *      (Phase 0 deploy contract).
 *   3. request origin, as a last resort for direct local hits.
 */
export function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");

  const configured = parseOrigins(
    process.env.PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
  );
  if (configured.length > 0) {
    const wanted = host?.trim().toLowerCase();
    const match = wanted
      ? configured.find((o) => new URL(o).host === wanted)
      : undefined;
    return match ?? configured[0];
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host && !host.startsWith("0.0.0.0")) return `${proto}://${host}`;

  return req.nextUrl.origin;
}

/** Comma-separated origins, trailing slashes dropped, unparseable entries skipped. */
function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter((entry) => {
      if (!entry) return false;
      try {
        new URL(entry);
        return true;
      } catch {
        return false;
      }
    });
}
