import { NextResponse, type NextRequest } from "next/server";
import {
  VISITOR_COOKIE,
  isValidVisitorId,
  newVisitorId,
  visitorCookieAttributes,
} from "@/lib/visitor";

/**
 * Assign every browser a random visitor id on its first request (D-016).
 *
 * When the request carries no valid `hb_visitor` cookie, a fresh id is set on
 * the response AND injected into the forwarded request's Cookie header, so the
 * page or route handling this same request already sees it. A malformed or
 * forged value (anything but a v4 UUID) is replaced.
 */
export function middleware(req: NextRequest) {
  const current = req.cookies.get(VISITOR_COOKIE)?.value;
  if (isValidVisitorId(current)) return NextResponse.next();

  const id = newVisitorId();
  const headers = new Headers(req.headers);
  const kept = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(`${VISITOR_COOKIE}=`));
  kept.push(`${VISITOR_COOKIE}=${id}`);
  headers.set("cookie", kept.join("; "));

  const res = NextResponse.next({ request: { headers } });
  res.cookies.set({ ...visitorCookieAttributes(), value: id });
  return res;
}

export const config = {
  // Every page gets a visitor id. Skipped: static assets, and every /api/
  // route (D-017). When middleware runs on a request with a body, Next.js
  // buffers the whole upload (up to middlewareClientMaxBodySize) and waits
  // for it to END before the route handler starts, which defeats the routes'
  // streaming byte cap (readJsonBody). The API routes do not need it: the
  // write routes mint and set hb_visitor themselves (visitorIdForWrite), and
  // the reads use the cookie the browser already holds from the pages,
  // falling back to seed-only scope without one.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
