import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { startServer, type RunningServer } from "./harness";

/**
 * Real-server proof of the signed visitor cookie (D-018): the Edge
 * middleware and the Node routes of the BUILT standalone server, over raw
 * HTTP. Tags are computed here with node:crypto, independently of the app.
 *
 * Run (needs a fresh build of the current tree):
 *   npm run build
 *   npx vitest run --config vitest.server.config.ts
 */
const SECRET = "visitor-suite-secret-".padEnd(48, "q");
const LABEL = "harborbistro:visitor-cookie:v1";
const DB = path.join(os.tmpdir(), `harbor-visitor-server-${process.pid}.db`);
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const STRIPE_PLACEHOLDER = {
  // Never used: every request here is refused or answered before Stripe.
  STRIPE_SECRET_KEY: "sk_test_server_suite_placeholder",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
};

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function tagFor(secret: string, id: string): string {
  const key = createHmac("sha256", secret).update(LABEL).digest();
  return b64url(createHmac("sha256", key).update(id).digest());
}
function visitorFromSetCookie(headers: Record<string, unknown>): string | null {
  const raw = headers["set-cookie"];
  const all = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
  const m = all.match(/hb_visitor=([^;]+)/);
  return m ? m[1] : null;
}
const cookie = (value: string) => `hb_visitor=${value}`;

/** A Saturday one to two weeks out: open, with 18:00 and 18:30 slots. */
function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7 + ((6 - d.getDay() + 7) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const booking = (name: string, time = "18:00") => ({ name, phone: "555-0100", partySize: 2, date: nextSaturday(), time });

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(DB, { fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const reservationVisitor = (id: string) =>
  withDb((db) => (db.prepare("SELECT visitor_id FROM reservations WHERE id = ?").get(id) as { visitor_id: string }).visitor_id);
const count = (table: string) =>
  withDb((db) => (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);

// Shared between the two describe blocks (they run in order).
let aCookie = "";
let aId = "";
let aReservation = "";
const ORDER_ID = "HB-SVCK7";

beforeAll(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${DB}${suffix}`, { force: true });
});
afterAll(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${DB}${suffix}`, { force: true });
});

describe("signed visitor cookie on the real server (SESSION_SECRET set)", () => {
  let srv: RunningServer;

  beforeAll(async () => {
    srv = await startServer({
      ...STRIPE_PLACEHOLDER,
      HARBOR_DB_PATH: DB,
      HARBOR_RETENTION_DISABLED: "1",
      SESSION_SECRET: SECRET,
    });
  }, 40_000);
  afterAll(async () => {
    await srv?.stop();
  });

  it("the middleware mints <uuid>.<HMAC tag> on a page view, HttpOnly, Lax, Secure", async () => {
    const r = await srv.request("GET", "/visit");
    expect(r.status).toBe(200);
    const value = visitorFromSetCookie(r.headers)!;
    const [id, tag] = value.split(".");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tag).toBe(tagFor(SECRET, id));
    const header = String(r.headers["set-cookie"]).toLowerCase();
    expect(header).toContain("httponly");
    expect(header).toContain("samesite=lax");
    expect(header).toContain("secure");
  });

  it("the middleware keeps a signed cookie and replaces an unsigned one with a fresh id", async () => {
    const id = randomUUID();
    const kept = await srv.request("GET", "/visit", { cookie: cookie(`${id}.${tagFor(SECRET, id)}`) });
    expect(kept.headers["set-cookie"]).toBeUndefined();
    const replaced = await srv.request("GET", "/visit", { cookie: cookie(id) });
    const fresh = visitorFromSetCookie(replaced.headers)!;
    expect(fresh.split(".")[0]).not.toBe(id);
    expect(fresh.split(".")[1]).toBe(tagFor(SECRET, fresh.split(".")[0]));
  });

  it("a cookieless booking gets a signed cookie; the database keeps the bare id", async () => {
    const r = await srv.request("POST", "/api/reservations", { json: booking("Alice Server") });
    expect(r.status).toBe(201);
    aCookie = visitorFromSetCookie(r.headers)!;
    aId = aCookie.split(".")[0];
    expect(aCookie).toBe(`${aId}.${tagFor(SECRET, aId)}`);
    aReservation = (JSON.parse(r.body) as { id: string }).id;
    expect(reservationVisitor(aReservation)).toBe(aId);
    // An order for A, inserted directly (checkout itself needs Stripe).
    withDb((db) =>
      db
        .prepare(
          `INSERT INTO orders (id, customer_name, customer_phone, fulfillment, items,
             subtotal_cents, tip_cents, total_cents, status, visitor_id)
           VALUES (?, 'Alice Order', '555-0101', 'pickup', '[]', 1000, 0, 1000, 'received', ?)`,
        )
        .run(ORDER_ID, aId),
    );
  });

  it("A's own signed cookie reads A's records", async () => {
    const detail = await srv.request("GET", `/reservations/${aReservation}`, { cookie: cookie(aCookie) });
    expect(detail.status).toBe(200);
    expect(detail.body).toContain("Alice Server");
    expect((await srv.request("GET", "/admin/reservations", { cookie: cookie(aCookie) })).body).toContain(aReservation);
    expect((await srv.request("GET", `/api/orders/${ORDER_ID}`, { cookie: cookie(aCookie) })).status).toBe(200);
    expect((await srv.request("GET", `/order/confirmation/${ORDER_ID}`, { cookie: cookie(aCookie) })).status).toBe(200);
  });

  it("every untrusted cookie claiming A's id reads as no visitor", async () => {
    const other = randomUUID();
    const aTag = tagFor(SECRET, aId);
    const alt = B64URL[B64URL.indexOf(aTag[42]) ^ 1];
    const untrusted: Record<string, string> = {
      unsigned: aId,
      tampered: `${aId}.${aTag[0] === "A" ? "B" : "A"}${aTag.slice(1)}`,
      "B's tag on A's id": `${aId}.${tagFor(SECRET, other)}`,
      "non-canonical final char": `${aId}.${aTag.slice(0, 42)}${alt}`,
      "foreign secret": `${aId}.${tagFor("z".repeat(48), aId)}`,
      "raw secret, no label": `${aId}.${b64url(createHmac("sha256", SECRET).update(aId).digest())}`,
      malformed: `${aId}.${aTag}.`,
    };
    for (const [label, value] of Object.entries(untrusted)) {
      const c = cookie(value);
      const detail = await srv.request("GET", `/reservations/${aReservation}`, { cookie: c });
      expect(detail.status, label).toBe(404);
      expect(detail.body, label).not.toContain("Alice Server");
      const admin = await srv.request("GET", "/admin/reservations", { cookie: c });
      expect(admin.status, label).toBe(200);
      expect(admin.body, label).not.toContain(aReservation);
      expect((await srv.request("GET", `/api/orders/${ORDER_ID}`, { cookie: c })).status, label).toBe(404);
      expect((await srv.request("GET", `/order/confirmation/${ORDER_ID}`, { cookie: c })).status, label).toBe(404);
      const act = await srv.request("POST", `/api/admin/reservations/${aReservation}`, {
        cookie: c,
        json: { status: "cancelled" },
      });
      expect(act.status, label).toBe(404);
    }
    const status = withDb((db) => (db.prepare("SELECT status FROM reservations WHERE id = ?").get(aReservation) as { status: string }).status);
    expect(status).toBe("confirmed");
  });

  it("a booking with an unsigned cookie claiming A's id mints a fresh visitor instead", async () => {
    const r = await srv.request("POST", "/api/reservations", { cookie: cookie(aId), json: booking("Mallory Server", "18:30") });
    expect(r.status).toBe(201);
    const fresh = visitorFromSetCookie(r.headers)!;
    const freshId = fresh.split(".")[0];
    expect(freshId).not.toBe(aId);
    expect(fresh).toBe(`${freshId}.${tagFor(SECRET, freshId)}`);
    const id = (JSON.parse(r.body) as { id: string }).id;
    expect(reservationVisitor(id)).toBe(freshId);
    // A does not see it; the minted visitor does.
    expect((await srv.request("GET", "/admin/reservations", { cookie: cookie(aCookie) })).body).not.toContain(id);
    expect((await srv.request("GET", "/admin/reservations", { cookie: cookie(fresh) })).body).toContain(id);
  });
});

describe("no usable SESSION_SECRET on the real server (D-018)", () => {
  let srv: RunningServer;

  beforeAll(async () => {
    // Same database, restarted without the secret.
    srv = await startServer(
      { ...STRIPE_PLACEHOLDER, HARBOR_DB_PATH: DB, HARBOR_RETENTION_DISABLED: "1" },
      ["SESSION_SECRET"],
    );
  }, 40_000);
  afterAll(async () => {
    await srv?.stop();
  });

  it("logs the problem at boot without the value", () => {
    expect(srv.log()).toContain("SESSION_SECRET is not set");
  });

  it("pages still render but no visitor cookie is issued", async () => {
    const r = await srv.request("GET", "/visit");
    expect(r.status).toBe(200);
    expect(r.headers["set-cookie"]).toBeUndefined();
  });

  it("a formerly valid signed cookie reads as no visitor", async () => {
    expect((await srv.request("GET", `/reservations/${aReservation}`, { cookie: cookie(aCookie) })).status).toBe(404);
    expect((await srv.request("GET", `/api/orders/${ORDER_ID}`, { cookie: cookie(aCookie) })).status).toBe(404);
    const admin = await srv.request("GET", "/admin/reservations", { cookie: cookie(aCookie) });
    expect(admin.status).toBe(200);
    expect(admin.body).not.toContain(aReservation);
  });

  it("bookings and checkout answer 503, store nothing, set no cookie", async () => {
    const reservations = count("reservations");
    const orders = count("orders");
    for (const c of [cookie(aCookie), undefined]) {
      const r = await srv.request("POST", "/api/reservations", { cookie: c, json: booking("No Secret", "19:00") });
      expect(r.status).toBe(503);
      expect(JSON.parse(r.body).error).toMatch(/temporarily unavailable/);
      expect(r.headers["set-cookie"]).toBeUndefined();
      const k = await srv.request("POST", "/api/checkout", {
        cookie: c,
        json: { lines: [], customerName: "No Secret", customerPhone: "555-0000", fulfillment: "pickup" },
      });
      expect(k.status).toBe(503);
      expect(JSON.parse(k.body).error).toMatch(/temporarily unavailable/);
      expect(k.headers["set-cookie"]).toBeUndefined();
    }
    expect(count("reservations")).toBe(reservations);
    expect(count("orders")).toBe(orders);
  });
});
