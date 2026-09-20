import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  VISITOR_KEY_LABEL,
  isVisitorSigningConfigured,
  scopeFromCookieHeader,
  signVisitorId,
  verifyVisitorCookie,
  visitorIdForWrite,
} from "./visitor";

/**
 * The signed visitor cookie (D-018): format, key derivation, and every way an
 * untrusted value must be refused. Computed independently with node:crypto
 * so the test does not just replay the implementation's own code.
 */
const SECRET = "k".repeat(24) + "9f3a1c7e5b2d4086";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The expected tag, derived exactly as D-018 specifies. */
function expectedTag(secret: string, id: string, label = VISITOR_KEY_LABEL): string {
  const visitorKey = createHmac("sha256", secret).update(label).digest();
  return b64url(createHmac("sha256", visitorKey).update(id).digest());
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

describe("signVisitorId", () => {
  it("produces <id>.<base64url HMAC-SHA-256(HMAC(secret, label), id)>", async () => {
    const value = await signVisitorId(A);
    expect(value).toBe(`${A}.${expectedTag(SECRET, A)}`);
    expect(value).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(VISITOR_KEY_LABEL).toBe("harborbistro:visitor-cookie:v1");
  });

  it("refuses to sign anything but a v4 UUID", async () => {
    await expect(signVisitorId("seed")).rejects.toThrow();
    await expect(signVisitorId(`${A}.x`)).rejects.toThrow();
  });
});

describe("verifyVisitorCookie", () => {
  it("accepts a signed cookie and returns the bare id", async () => {
    expect(await verifyVisitorCookie(await signVisitorId(A))).toBe(A);
    expect(await verifyVisitorCookie(`${A}.${expectedTag(SECRET, A)}`)).toBe(A);
  });

  it("rejects an unsigned (pre-D-018) bare UUID", async () => {
    expect(await verifyVisitorCookie(A)).toBeNull();
  });

  it("rejects a tampered tag and a tampered id", async () => {
    const tag = expectedTag(SECRET, A);
    const flipped = tag[0] === "A" ? `B${tag.slice(1)}` : `A${tag.slice(1)}`;
    expect(await verifyVisitorCookie(`${A}.${flipped}`)).toBeNull();
    const otherId = `${A.slice(0, -1)}2`;
    expect(await verifyVisitorCookie(`${otherId}.${tag}`)).toBeNull();
  });

  it("rejects B's valid tag presented on A's id", async () => {
    const bTag = (await signVisitorId(B))!.split(".")[1];
    expect(await verifyVisitorCookie(`${B}.${bTag}`)).toBe(B);
    expect(await verifyVisitorCookie(`${A}.${bTag}`)).toBeNull();
  });

  it("rejects a non-canonical final character (same bytes, spare bits set)", async () => {
    const tag = expectedTag(SECRET, A);
    const last = tag[42];
    // 43 chars carry 258 bits for 256 data bits: the last char's low 2 bits
    // are padding. Flipping one of them decodes to the same 32 bytes.
    const alt = B64URL[B64URL.indexOf(last) ^ 1];
    const nonCanonical = `${tag.slice(0, 42)}${alt}`;
    expect(Buffer.from(nonCanonical, "base64url").equals(Buffer.from(tag, "base64url"))).toBe(true);
    expect(await verifyVisitorCookie(`${A}.${nonCanonical}`)).toBeNull();
    expect(await verifyVisitorCookie(`${A}.${tag}`)).toBe(A);
  });

  it("rejects a cookie signed under a foreign secret", async () => {
    const foreign = "z".repeat(48);
    expect(await verifyVisitorCookie(`${A}.${expectedTag(foreign, A)}`)).toBeNull();
    // And one this server signed stops verifying after a secret rotation.
    const mine = await signVisitorId(A);
    process.env.SESSION_SECRET = foreign;
    expect(await verifyVisitorCookie(mine)).toBeNull();
  });

  it("rejects a tag made with the raw secret and no label (key separation)", async () => {
    const raw = b64url(createHmac("sha256", SECRET).update(A).digest());
    expect(await verifyVisitorCookie(`${A}.${raw}`)).toBeNull();
  });

  it("rejects a tag made under another label (slatewell's, or another version)", async () => {
    for (const label of ["slatewell:visitor-cookie:v1", "harborbistro:visitor-cookie:v2"]) {
      expect(await verifyVisitorCookie(`${A}.${expectedTag(SECRET, A, label)}`)).toBeNull();
    }
  });

  it("rejects malformed values", async () => {
    const tag = expectedTag(SECRET, A);
    for (const bad of [
      "",
      "seed",
      `seed.${tag}`,
      `${A}.`,
      `${A}.${tag}.`,
      `${A}.${tag}=`,
      `${A}.${tag}A`,
      `${A}.${tag.slice(0, 42)}`,
      `${A}.+${tag.slice(1)}`,
      `${A}./${tag.slice(1)}`,
      ` ${A}.${tag}`,
      `${A}..${tag}`,
    ]) {
      expect(await verifyVisitorCookie(bad), bad).toBeNull();
    }
    // Upper-case hex in the id: the tag is over the exact lower-case string.
    const lettered = "abcdef01-2345-4678-9abc-def012345678";
    const letteredTag = expectedTag(SECRET, lettered);
    expect(await verifyVisitorCookie(`${lettered}.${letteredTag}`)).toBe(lettered);
    expect(await verifyVisitorCookie(`${lettered.toUpperCase()}.${letteredTag}`)).toBeNull();
    expect(await verifyVisitorCookie(undefined)).toBeNull();
    expect(await verifyVisitorCookie(null)).toBeNull();
  });

  it("reads through the Cookie header helper", async () => {
    const value = await signVisitorId(A);
    expect(await scopeFromCookieHeader(`x=1; hb_visitor=${value}`)).toEqual({ visitorId: A });
    expect(await scopeFromCookieHeader(`x=1; hb_visitor=${A}`)).toEqual({ visitorId: null });
  });
});

/**
 * The current `.env.example` placeholder, read live from the committed file
 * rather than asserted from memory. This is the structural rule from
 * session-secret.ts in test form: every future placeholder must stay under
 * MIN_SESSION_SECRET_LENGTH so the length floor refuses it on its own,
 * with no denylist involved.
 */
const envExamplePath = fileURLToPath(new URL("../../.env.example", import.meta.url));
const envExampleSessionSecret = readFileSync(envExamplePath, "utf8").match(
  /^SESSION_SECRET=(.*)$/m,
)![1].trim();

describe("no usable SESSION_SECRET (D-018)", () => {
  const unusable: Array<[string, string | undefined]> = [
    ["missing", undefined],
    ["empty", ""],
    ["31 chars", "x".repeat(31)],
    // Retired .env.example placeholder (31 chars). No longer denylisted by
    // exact string (removed, see session-secret.ts): refused because it is
    // one character short of MIN_SESSION_SECRET_LENGTH, same as any other
    // 31-char value.
    ["the retired .env.example placeholder (31 chars, under the floor)", "replace-with-48-bytes-of-random"],
    // The CURRENT .env.example placeholder, parsed live from the committed
    // file. Proves the floor -- not a denylist -- refuses whatever ships
    // today.
    [`the current .env.example placeholder (${envExampleSessionSecret.length} chars)`, envExampleSessionSecret],
  ];

  for (const [label, secret] of unusable) {
    it(`${label}: nothing is signed or verified, writes are refused`, async () => {
      const signed = await signVisitorId(A);
      if (secret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = secret;
      expect(isVisitorSigningConfigured()).toBe(false);
      expect(await signVisitorId(A)).toBeNull();
      // A cookie that was valid under the old secret is no longer trusted.
      expect(await verifyVisitorCookie(signed)).toBeNull();
      const req = new Request("http://t/", { headers: { cookie: `hb_visitor=${signed}` } });
      expect(await visitorIdForWrite(req)).toEqual({ ok: false });
    });
  }

  it("exactly 32 chars is accepted (the portal session's existing rule)", async () => {
    process.env.SESSION_SECRET = "x".repeat(32);
    expect(isVisitorSigningConfigured()).toBe(true);
    expect(await verifyVisitorCookie(await signVisitorId(A))).toBe(A);
  });
});

describe("visitorIdForWrite", () => {
  it("keeps a validly signed visitor and sets no new cookie", async () => {
    const req = new Request("http://t/", { headers: { cookie: `hb_visitor=${await signVisitorId(A)}` } });
    expect(await visitorIdForWrite(req)).toEqual({ ok: true, visitorId: A, cookieValue: null });
  });

  it("mints a fresh signed visitor for every untrusted cookie, never adopting the claimed id", async () => {
    const bTag = (await signVisitorId(B))!.split(".")[1];
    for (const cookie of [
      null,
      `hb_visitor=${A}`,
      `hb_visitor=${A}.${bTag}`,
      `hb_visitor=${A}.${expectedTag("z".repeat(48), A)}`,
      "hb_visitor=seed",
    ]) {
      const req = new Request("http://t/", { headers: cookie ? { cookie } : {} });
      const w = await visitorIdForWrite(req);
      expect(w.ok).toBe(true);
      if (!w.ok) continue;
      expect(w.visitorId).not.toBe(A);
      expect(w.visitorId).not.toBe(B);
      expect(w.cookieValue).toBe(`${w.visitorId}.${expectedTag(SECRET, w.visitorId)}`);
    }
  });
});
