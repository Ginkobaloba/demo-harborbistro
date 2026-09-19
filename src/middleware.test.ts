import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import {
  isValidVisitorId,
  readCookie,
  scopeFromCookieHeader,
  scopeSql,
  signVisitorId,
  verifyVisitorCookie,
} from "./lib/visitor";

const SECRET = "m".repeat(48);
const VALID = "44444444-4444-4444-8444-444444444444";

function setCookieValue(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  const m = header?.match(/hb_visitor=([^;]+)/);
  return m ? m[1] : null;
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
});

describe("visitor middleware", () => {
  it("mints a signed, HttpOnly, SameSite=Lax visitor cookie on the first request", async () => {
    const res = await middleware(new NextRequest("http://t/admin"));
    const value = setCookieValue(res);
    const id = await verifyVisitorCookie(value);
    expect(isValidVisitorId(id)).toBe(true);
    expect(value).toBe(`${id}.${value!.split(".")[1]}`);
    const header = res.headers.get("set-cookie")!.toLowerCase();
    expect(header).toContain("httponly");
    expect(header).toContain("samesite=lax");
    expect(header).toContain("path=/");
    // Forwarded, signed, to the page handling this same request.
    expect(res.headers.get("x-middleware-request-cookie")).toContain(`hb_visitor=${value}`);
  });

  it("mints a different id per browser", async () => {
    const a = setCookieValue(await middleware(new NextRequest("http://t/")));
    const b = setCookieValue(await middleware(new NextRequest("http://t/")));
    expect(a).not.toBe(b);
  });

  it("keeps a validly signed existing cookie", async () => {
    const signed = await signVisitorId(VALID);
    const req = new NextRequest("http://t/", { headers: { cookie: `hb_visitor=${signed}` } });
    expect((await middleware(req)).headers.get("set-cookie")).toBeNull();
  });

  it("replaces an unsigned, forged or malformed cookie with a fresh signed id, keeping other cookies", async () => {
    const signed = (await signVisitorId(VALID))!;
    const bad = [
      "seed",
      "abc",
      // The pre-D-018 format: a bare, valid UUID. No longer trusted.
      VALID,
      `${VALID}x`,
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      // Tampered tag.
      `${signed.slice(0, -2)}${signed.endsWith("AA") ? "BB" : "AA"}`,
    ];
    for (const value of bad) {
      const req = new NextRequest("http://t/", { headers: { cookie: `a=1; hb_visitor=${value}` } });
      const res = await middleware(req);
      const fresh = setCookieValue(res);
      const id = await verifyVisitorCookie(fresh);
      expect(isValidVisitorId(id)).toBe(true);
      // The claimed id is never adopted.
      expect(id).not.toBe(VALID);
      const forwarded = res.headers.get("x-middleware-request-cookie") ?? "";
      expect(forwarded).toContain("a=1");
      expect(forwarded).toContain(`hb_visitor=${fresh}`);
      expect(forwarded).not.toContain(`hb_visitor=${value};`);
    }
  });

  it("with no usable SESSION_SECRET sets no cookie and lets the page render", async () => {
    for (const secret of [undefined, "short", "replace-with-48-bytes-of-random"]) {
      if (secret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = secret;
      const res = await middleware(new NextRequest("http://t/admin"));
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("x-middleware-request-cookie")).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });
});

describe("visitor helpers", () => {
  it("reads a cookie from a header", () => {
    expect(readCookie(`x=1; hb_visitor=${VALID}; y=2`, "hb_visitor")).toBe(VALID);
    expect(readCookie(null, "hb_visitor")).toBeNull();
  });

  it("never lets a cookie claim the seed scope", async () => {
    expect(await scopeFromCookieHeader("hb_visitor=seed")).toEqual({ visitorId: null });
    expect(scopeSql({ visitorId: null }).params).toEqual(["seed", "seed"]);
    expect(scopeSql({ visitorId: VALID }).params).toEqual(["seed", VALID]);
  });
});
