import { cookies } from "next/headers";
import { VISITOR_COOKIE, scopeFor, type VisitorScope } from "./visitor";

/**
 * The calling browser's visitor scope, for server components (D-016). Route
 * handlers use scopeFromRequest instead, which reads the Cookie header
 * directly and so also works when the handler is called outside Next.js
 * (unit tests).
 *
 * On a browser's very first request the middleware mints the id and injects
 * it into the request's Cookie header, so this sees it even before the
 * browser has stored the Set-Cookie.
 */
export async function readVisitorScope(): Promise<VisitorScope> {
  const jar = await cookies();
  return scopeFor(jar.get(VISITOR_COOKIE)?.value);
}
