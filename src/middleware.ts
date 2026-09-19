import { NextResponse, type NextRequest } from "next/server";
import {
  VISITOR_COOKIE,
  newVisitorId,
  signVisitorId,
  verifyVisitorCookie,
  visitorCookieAttributes,
} from "@/lib/visitor";

/**
 * Assign every browser a signed visitor id on its first page view (D-016,
 * signed since D-018).
 *
 * When the request carries no validly signed `hb_visitor` cookie (none, the
 * pre-D-018 unsigned UUID, a tampered or foreign-secret value, junk), a fresh
 * id is minted and signed, set on the response AND injected into the
 * forwarded request's Cookie header, so the page handling this same request
 * already sees it. The claimed id of an untrusted cookie is never adopted.
 *
 * Without a usable SESSION_SECRET nothing can be signed, so no cookie is set
 * and the page renders with seed-only scope (D-018).
 */
export async function middleware(req: NextRequest) {
  const current = req.cookies.get(VISITOR_COOKIE)?.value;
  if (await verifyVisitorCookie(current)) return NextResponse.next();

  const signed = await signVisitorId(newVisitorId());
  if (!signed) return NextResponse.next();

  const headers = new Headers(req.headers);
  const kept = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(`${VISITOR_COOKIE}=`));
  kept.push(`${VISITOR_COOKIE}=${signed}`);
  headers.set("cookie", kept.join("; "));

  const res = NextResponse.next({ request: { headers } });
  res.cookies.set({ ...visitorCookieAttributes(), value: signed });
  return res;
}

export const config = {
  // Every page gets a visitor id. Skipped: static assets, and every /api/
  // route (D-017). When middleware runs on a request with a body, Next.js
  // buffers the whole upload (up to middlewareClientMaxBodySize) and waits
  // for it to END before the route handler starts, which defeats the routes'
  // streaming byte cap (readJsonBody). The API routes do not need it: the
  // write routes mint and set hb_visitor themselves (visitorIdForWrite), and
  // the reads verify the cookie the browser already holds from the pages,
  // falling back to seed-only scope without a valid one.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
