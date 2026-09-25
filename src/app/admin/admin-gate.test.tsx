import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { adminSurfacesEnabled } from "@/lib/admin-gate";

/**
 * App-level admin gate (docs/decisions.md D-022, src/lib/admin-gate.ts):
 * closed by default, open only when HARBOR_ADMIN_ENABLED is exactly "1".
 *
 * Covers the predicate directly, then every one of the five gated surfaces:
 * the three /admin pages (notFound() when closed) and the two
 * /api/admin/*\/[id] route handlers (404 when closed, BEFORE params, body
 * parsing, or any DB write -- proven with a before/after row comparison, not
 * just the status code).
 *
 * D-016 visitor scoping itself is covered by visitor-scope.test.tsx (and the
 * real-server suite), which runs with this gate forced open; that is not
 * repeated here.
 */
const TMP = path.join(os.tmpdir(), `harbor-admin-gate-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;
process.env.HARBOR_RETENTION_DISABLED = "1";
process.env.SESSION_SECRET = "g".repeat(48);
// Gate closed by default in this file (matches production default); tests
// that need it open stub the env var themselves and afterEach undoes it.
delete process.env.HARBOR_ADMIN_ENABLED;

// No cookie store is needed: the gate check runs before readVisitorScope.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
// Client islands are irrelevant to gate behavior; stub to plain markers
// (same approach as visitor-scope.test.tsx).
vi.mock("@/components/admin/AutoRefresh", () => ({ AutoRefresh: () => null }));
vi.mock("@/components/admin/OrderActions", () => ({
  OrderActions: ({ id }: { id: string }) => <span data-action-order={id} />,
}));
vi.mock("@/components/admin/ReservationActions", () => ({
  ReservationActions: ({ id }: { id: string }) => <span data-action-res={id} />,
}));

// What next/navigation's notFound() throws (the 404 page, not a crash).
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

const ORDER_ID = "HB-GATE1";
const RES_ID = "HR-GATE1";

let db: Database.Database;
let today: string;

function insertSeedOrder() {
  db.prepare(
    `INSERT INTO orders
       (id, customer_name, customer_phone, fulfillment, items,
        subtotal_cents, tip_cents, total_cents, status, visitor_id)
     VALUES (?, 'Gate Diner', '555-0100', 'pickup', '[]', 1000, 0, 1000, 'received', 'seed')`,
  ).run(ORDER_ID);
}

function insertSeedReservation() {
  db.prepare(
    `INSERT INTO reservations
       (id, name, phone, party_size, reserved_date, reserved_time, status, visitor_id)
     VALUES (?, 'Gate Guest', '555-0200', 2, ?, '18:00', 'confirmed', 'seed')`,
  ).run(RES_ID, today);
}

function orderRow(): Record<string, unknown> {
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(ORDER_ID) as Record<string, unknown>;
}
function reservationRow(): Record<string, unknown> {
  return db.prepare("SELECT * FROM reservations WHERE id = ?").get(RES_ID) as Record<string, unknown>;
}

async function render(page: () => Promise<ReactElement> | ReactElement): Promise<string> {
  return renderToStaticMarkup(await page());
}

function post(body?: unknown, raw?: string): Request {
  return new Request("http://t/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  db = (await import("@/lib/db")).getDb();
  today = (await import("@/lib/reservations")).todayLocalDate();
});

beforeEach(() => {
  db.prepare("DELETE FROM orders").run();
  db.prepare("DELETE FROM reservations").run();
  insertSeedOrder();
  insertSeedReservation();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("adminSurfacesEnabled predicate", () => {
  it.each([
    ["1", true],
    ["true", false],
    ["TRUE", false],
    ["yes", false],
    ["0", false],
    ["", false],
    [" 1", false],
    ["1 ", false],
    ["01", false],
  ])("HARBOR_ADMIN_ENABLED=%j -> %p", (value, expected) => {
    vi.stubEnv("HARBOR_ADMIN_ENABLED", value);
    expect(adminSurfacesEnabled()).toBe(expected);
  });

  it("unset is closed", () => {
    vi.unstubAllEnvs();
    delete process.env.HARBOR_ADMIN_ENABLED;
    expect(adminSurfacesEnabled()).toBe(false);
  });

  it("is read at call time, not cached: flipping the env var flips the result", () => {
    expect(adminSurfacesEnabled()).toBe(false);
    vi.stubEnv("HARBOR_ADMIN_ENABLED", "1");
    expect(adminSurfacesEnabled()).toBe(true);
    vi.stubEnv("HARBOR_ADMIN_ENABLED", "0");
    expect(adminSurfacesEnabled()).toBe(false);
  });
});

describe("gate closed (default): pages answer a real 404", () => {
  it("/admin", async () => {
    const { default: Page } = await import("@/app/admin/page");
    await expect(render(Page)).rejects.toThrow(NOT_FOUND);
  });

  it("/admin/orders", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    await expect(render(Page)).rejects.toThrow(NOT_FOUND);
  });

  it("/admin/reservations", async () => {
    const { default: Page } = await import("@/app/admin/reservations/page");
    await expect(render(Page)).rejects.toThrow(NOT_FOUND);
  });
});

describe("gate open: pages render normally", () => {
  beforeEach(() => vi.stubEnv("HARBOR_ADMIN_ENABLED", "1"));

  it("/admin renders the operator home", async () => {
    const { default: Page } = await import("@/app/admin/page");
    const html = await render(Page);
    expect(html).toContain("Operator");
  });

  it("/admin/orders renders the kitchen view with the seed order", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    const html = await render(Page);
    expect(html).toContain("Kitchen");
    expect(html).toContain(ORDER_ID);
  });

  it("/admin/reservations renders with the seed reservation", async () => {
    const { default: Page } = await import("@/app/admin/reservations/page");
    const html = await render(Page);
    expect(html).toContain("Reservations");
    expect(html).toContain(RES_ID);
  });
});

describe("gate closed (default): route handlers 404 and change nothing", () => {
  it("POST /api/admin/orders/[id]: 404, body matches the scope-404 shape, row untouched", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/route");
    const before = orderRow();
    const res = await POST(post({ action: "advance" }), ctx(ORDER_ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
    expect(orderRow()).toEqual(before);
  });

  it("POST /api/admin/reservations/[id]: 404, body matches the scope-404 shape, row untouched", async () => {
    const { POST } = await import("@/app/api/admin/reservations/[id]/route");
    const before = reservationRow();
    const res = await POST(post({ status: "seated" }), ctx(RES_ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Reservation not found" });
    expect(reservationRow()).toEqual(before);
  });

  it("precedes body parsing: malformed JSON still answers 404, not 400", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/route");
    const before = orderRow();
    const res = await POST(post(undefined, "{not json"), ctx(ORDER_ID));
    expect(res.status).toBe(404);
    expect(orderRow()).toEqual(before);
  });

  it("precedes the body-size cap: an over-cap body still answers 404, not 413", async () => {
    const { POST } = await import("@/app/api/admin/reservations/[id]/route");
    const { BODY_LIMITS } = await import("@/lib/request-body");
    const before = reservationRow();
    const oversized = JSON.stringify({ status: "seated", pad: "p".repeat(BODY_LIMITS.adminAction * 2) });
    const res = await POST(post(undefined, oversized), ctx(RES_ID));
    expect(res.status).toBe(404);
    expect(reservationRow()).toEqual(before);
  });
});

describe("gate open: route handlers act normally", () => {
  beforeEach(() => vi.stubEnv("HARBOR_ADMIN_ENABLED", "1"));

  it("POST /api/admin/orders/[id] advances the seed order", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/route");
    const res = await POST(post({ action: "advance" }), ctx(ORDER_ID));
    expect(res.status).toBe(200);
    expect(orderRow().status).toBe("preparing");
  });

  it("POST /api/admin/reservations/[id] seats the seed reservation", async () => {
    const { POST } = await import("@/app/api/admin/reservations/[id]/route");
    const res = await POST(post({ status: "seated" }), ctx(RES_ID));
    expect(res.status).toBe(200);
    expect(reservationRow().status).toBe("seated");
  });
});
