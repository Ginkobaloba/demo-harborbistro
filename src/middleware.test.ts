import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import {
  isValidVisitorId,
  readCookie,
  scopeFromCookieHeader,
  scopeSql,
} from "./lib/visitor";

const VALID = "44444444-4444-4444-8444-444444444444";

function setCookieValue(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  const m = header?.match(/hb_visitor=([^;]+)/);
  return m ? m[1] : null;
}

describe("visitor middleware", () => {
  it("mints an HttpOnly, SameSite=Lax visitor cookie on the first request", () => {
    const res = middleware(new NextRequest("http://t/admin"));
    const id = setCookieValue(res);
    expect(isValidVisitorId(id)).toBe(true);
    const header = res.headers.get("set-cookie")!.toLowerCase();
    expect(header).toContain("httponly");
    expect(header).toContain("samesite=lax");
    expect(header).toContain("path=/");
    // Forwarded to the page handling this same request.
    expect(res.headers.get("x-middleware-request-cookie")).toContain(`hb_visitor=${id}`);
  });

  it("mints a different id per browser", () => {
    const a = setCookieValue(middleware(new NextRequest("http://t/")));
    const b = setCookieValue(middleware(new NextRequest("http://t/")));
    expect(a).not.toBe(b);
  });

  it("keeps a valid existing id", () => {
    const req = new NextRequest("http://t/", { headers: { cookie: `hb_visitor=${VALID}` } });
    expect(middleware(req).headers.get("set-cookie")).toBeNull();
  });

  it("replaces a forged or malformed id, keeping other cookies", () => {
    for (const bad of ["seed", "abc", `${VALID}x`, "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"]) {
      const req = new NextRequest("http://t/", { headers: { cookie: `a=1; hb_visitor=${bad}` } });
      const res = middleware(req);
      const id = setCookieValue(res);
      expect(isValidVisitorId(id)).toBe(true);
      const forwarded = res.headers.get("x-middleware-request-cookie") ?? "";
      expect(forwarded).toContain("a=1");
      expect(forwarded).not.toContain(`hb_visitor=${bad};`);
    }
  });
});

describe("visitor helpers", () => {
  it("reads a cookie from a header", () => {
    expect(readCookie(`x=1; hb_visitor=${VALID}; y=2`, "hb_visitor")).toBe(VALID);
    expect(readCookie(null, "hb_visitor")).toBeNull();
  });

  it("never lets a cookie claim the seed scope", () => {
    expect(scopeFromCookieHeader("hb_visitor=seed")).toEqual({ visitorId: null });
    expect(scopeSql({ visitorId: null }).params).toEqual(["seed", "seed"]);
    expect(scopeSql({ visitorId: VALID }).params).toEqual(["seed", VALID]);
  });
});
