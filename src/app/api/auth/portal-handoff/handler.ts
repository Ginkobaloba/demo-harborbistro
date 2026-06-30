import { NextResponse } from "next/server";
import type { JWTVerifyGetKey } from "jose";
import {
  verifyPortalToken,
  readPortalTokenConfig,
  type PortalTokenConfig,
} from "@/lib/portal-token";
import {
  mintHarborSession,
  harborSessionCookieAttributes,
} from "@/lib/portal-session";

/**
 * Portal handoff logic (chunk 4b), kept out of route.ts so the route file can
 * export only the HTTP method handlers Next.js permits (a non-handler export
 * there fails `next build`'s route type check). The handler is exported here
 * so integration tests can inject a local JWKS resolver without touching env
 * or network.
 *
 * Flow:
 *  1. Portal redirects user to /portal/handoff#portal_token=<JWT>.
 *  2. Client page reads window.location.hash, scrubs it, and POSTs the
 *     token here.
 *  3. We verifyPortalToken against the JWKS, mint our own hb_session,
 *     and return the redirect target.
 *
 * Errors return 401 with a generic message; the contract intentionally
 * does not expose verification detail.
 */
const DEFAULT_LANDING = "/order";

export interface HandoffDeps {
  config?: PortalTokenConfig;
  keyResolver?: JWTVerifyGetKey;
}

export async function handlePortalHandoff(
  req: Request,
  deps: HandoffDeps = {},
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request" },
      { status: 400 },
    );
  }

  const token =
    typeof body === "object" && body !== null && "token" in body
      ? String((body as { token: unknown }).token ?? "")
      : "";

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "missing_token" },
      { status: 400 },
    );
  }

  let cfg: PortalTokenConfig;
  try {
    cfg = deps.config ?? readPortalTokenConfig();
  } catch {
    return NextResponse.json(
      { ok: false, error: "config_error" },
      { status: 500 },
    );
  }

  const verified = await verifyPortalToken(token, cfg, deps.keyResolver);
  if (!verified) {
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 401 },
    );
  }

  const email = String(verified.payload.sub ?? "").toLowerCase();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 401 },
    );
  }

  const customerId =
    typeof verified.payload.customer_id === "string"
      ? verified.payload.customer_id
      : null;
  const role =
    typeof verified.payload.role === "string"
      ? verified.payload.role
      : "customer";

  const { token: sessionToken, expiresAt } = await mintHarborSession({
    email,
    customerId,
    role,
  });

  const attrs = harborSessionCookieAttributes(expiresAt);
  const res = NextResponse.json({
    ok: true,
    redirect: DEFAULT_LANDING,
    expires_at: expiresAt.toISOString(),
  });
  res.cookies.set({
    ...attrs,
    value: sessionToken,
  });
  return res;
}
