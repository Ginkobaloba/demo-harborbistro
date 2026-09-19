import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { NextRequest } from "next/server";

/**
 * POST /api/reservations input caps (D-017): each free-text field is limited
 * after trimming, the whole body is byte-capped, and a refused request stores
 * nothing. A booking at the exact limits still goes through.
 */
const TMP = path.join(os.tmpdir(), `harbor-reservations-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;
process.env.HARBOR_RETENTION_DISABLED = "1";
// The visitor cookie is signed (D-018); without a usable secret every write is 503.
process.env.SESSION_SECRET = "t".repeat(48);

const VISITOR = "44444444-4444-4444-8444-444444444444";

type RouteModule = typeof import("./route");
type Limits = typeof import("@/lib/request-body");
let route: RouteModule;
let limits: Limits;
let db: Database.Database;
let signedVisitor: string;
let saturday: string;

/** A Saturday one to two weeks out: open, with an 18:00 slot. */
function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7 + ((6 - d.getDay() + 7) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function reservationCount(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM reservations").get() as { c: number }).c;
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Test Guest",
    phone: "555-0100",
    email: "guest@example.com",
    partySize: 2,
    date: saturday,
    time: "18:00",
    notes: "Window seat if possible",
    ...overrides,
  };
}

function reserve(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/reservations", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `hb_visitor=${signedVisitor}` },
    body: raw ?? JSON.stringify(body),
  });
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  db = (await import("@/lib/db")).getDb();
  signedVisitor = (await (await import("@/lib/visitor")).signVisitorId(VISITOR))!;
  route = await import("./route");
  limits = await import("@/lib/request-body");
  saturday = nextSaturday();
});

beforeEach(() => {
  db.prepare("DELETE FROM reservations").run();
});

describe("POST /api/reservations input caps", () => {
  it("still books a normal reservation (201, one tagged row)", async () => {
    const res = await route.POST(reserve(validBody()));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const row = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id) as Record<string, unknown>;
    expect(row.name).toBe("Test Guest");
    expect(row.visitor_id).toBe(VISITOR);
    expect(reservationCount()).toBe(1);
  });

  for (const key of ["name", "phone", "email", "notes"] as const) {
    it(`rejects ${key} one character over its limit with 400 and stores nothing`, async () => {
      const max = limits.FIELD_LIMITS[key];
      const res = await route.POST(reserve(validBody({ [key]: "x".repeat(max + 1) })));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(new RegExp(`at most ${max} characters`));
      expect(reservationCount()).toBe(0);
    });
  }

  it("accepts every free-text field at exactly its limit", async () => {
    const L = limits.FIELD_LIMITS;
    const res = await route.POST(
      reserve(
        validBody({
          name: "n".repeat(L.name),
          phone: "5".repeat(L.phone),
          email: "e".repeat(L.email),
          notes: "o".repeat(L.notes),
        }),
      ),
    );
    expect(res.status).toBe(201);
    const row = db.prepare("SELECT * FROM reservations").get() as Record<string, string>;
    expect(row.name).toHaveLength(L.name);
    expect(row.phone).toHaveLength(L.phone);
    expect(row.email).toHaveLength(L.email);
    expect(row.notes).toHaveLength(L.notes);
  });

  it("measures the limit after trimming surrounding whitespace", async () => {
    const res = await route.POST(
      reserve(validBody({ name: `   ${"n".repeat(limits.FIELD_LIMITS.name)}   ` })),
    );
    expect(res.status).toBe(201);
  });

  it("refuses a 1 MB name with 413 and stores nothing (the verify repro)", async () => {
    const res = await route.POST(reserve(validBody({ name: "x".repeat(1024 * 1024) })));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/too large/i);
    expect(reservationCount()).toBe(0);
  });

  it("refuses a body one byte over the cap and accepts one at the cap", async () => {
    const cap = limits.BODY_LIMITS.reservation;
    // Pad an unknown field so the body lands exactly on the cap, then one over.
    const base = JSON.stringify({ ...validBody(), pad: "" });
    const atCap = JSON.stringify({ ...validBody(), pad: "p".repeat(cap - base.length) });
    expect(Buffer.byteLength(atCap)).toBe(cap);
    const overCap = JSON.stringify({ ...validBody(), pad: "p".repeat(cap - base.length + 1) });

    const over = await route.POST(reserve(null, overCap));
    expect(over.status).toBe(413);
    expect(reservationCount()).toBe(0);

    const at = await route.POST(reserve(null, atCap));
    expect(at.status).toBe(201);
    expect(reservationCount()).toBe(1);
  });

  it("refuses non-string text fields instead of stringifying them", async () => {
    const res = await route.POST(reserve(validBody({ notes: { evil: true } })));
    expect(res.status).toBe(400);
    expect(reservationCount()).toBe(0);
  });

  it("refuses malformed JSON and a non-object body with 400", async () => {
    expect((await route.POST(reserve(null, "{not json"))).status).toBe(400);
    expect((await route.POST(reserve(null, "[1,2,3]"))).status).toBe(400);
    expect(reservationCount()).toBe(0);
  });
});
