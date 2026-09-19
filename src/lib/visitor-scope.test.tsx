import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * Per-browser demo scope (D-016), end to end at the server boundary: the
 * admin pages' rendered HTML, the admin POST APIs, and the public detail
 * routes, each exercised as two different browsers (two visitor cookies)
 * against one throwaway database.
 */
const TMP = path.join(os.tmpdir(), `harbor-scope-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;
process.env.HARBOR_RETENTION_DISABLED = "1";

// Server components read the visitor cookie through next/headers. Outside a
// Next.js request there is no cookie store, so the test supplies one: set
// `currentCookie` to act as a given browser.
let currentCookie: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (!currentCookie) return undefined;
      const m = currentCookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
      return m ? { name, value: m[1] } : undefined;
    },
  }),
}));
// Client islands (router hooks, fetch) are irrelevant to what data the server
// renders; stub them to plain markers.
vi.mock("@/components/admin/AutoRefresh", () => ({ AutoRefresh: () => null }));
vi.mock("@/components/admin/OrderActions", () => ({
  OrderActions: ({ id }: { id: string }) => <span data-action-order={id} />,
}));
vi.mock("@/components/admin/ReservationActions", () => ({
  ReservationActions: ({ id }: { id: string }) => <span data-action-res={id} />,
}));
vi.mock("@/components/order/OrderTracker", () => ({ OrderTracker: () => null }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const cookieFor = (id: string) => `other=1; hb_visitor=${id}`;

let db: Database.Database;
let today: string;

function insertOrder(id: string, name: string, phone: string, visitor: string | null, status = "received") {
  db.prepare(
    `INSERT INTO orders
       (id, customer_name, customer_phone, fulfillment, items,
        subtotal_cents, tip_cents, total_cents, status, visitor_id)
     VALUES (?, ?, ?, 'pickup', '[]', 1000, 0, 1000, ?, ?)`,
  ).run(id, name, phone, status, visitor);
}

function insertReservation(id: string, name: string, phone: string, visitor: string | null) {
  db.prepare(
    `INSERT INTO reservations
       (id, name, phone, party_size, reserved_date, reserved_time, status, visitor_id)
     VALUES (?, ?, ?, 2, ?, '18:00', 'confirmed', ?)`,
  ).run(id, name, phone, today, visitor);
}

async function render(page: () => Promise<ReactElement> | ReactElement): Promise<string> {
  return renderToStaticMarkup(await page());
}

async function asBrowser<T>(cookie: string | null, fn: () => Promise<T>): Promise<T> {
  currentCookie = cookie;
  try {
    return await fn();
  } finally {
    currentCookie = null;
  }
}

function post(url: string, body: unknown, cookie: string | null): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function get(url: string, cookie: string | null): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} });
}

// What next/navigation's notFound() throws (the 404 page, not a crash).
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  db = (await import("./db")).getDb();
  today = (await import("./reservations")).todayLocalDate();
});

beforeEach(() => {
  db.prepare("DELETE FROM orders").run();
  db.prepare("DELETE FROM reservations").run();
  insertOrder("HB-SEED1", "Sample Diner", "555-0111", "seed");
  insertOrder("HB-AAAA1", "Alice Visitor", "555-7001", A);
  insertOrder("HB-BBBB1", "Bob Visitor", "555-8001", B);
  insertOrder("HB-LEGC1", "Legacy Person", "555-9001", null);
  insertReservation("HR-SEED1", "Sample Guest", "555-0222", "seed");
  insertReservation("HR-AAAA1", "Alice Booker", "555-7002", A);
  insertReservation("HR-BBBB1", "Bob Booker", "555-8002", B);
  insertReservation("HR-LEGC1", "Legacy Booker", "555-9002", null);
});

describe("admin pages render only seed data plus the browser's own", () => {
  it("/admin/orders as browser A never contains browser B's order", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    const html = await asBrowser(cookieFor(A), () => render(Page));
    expect(html).toContain("HB-SEED1");
    expect(html).toContain("HB-AAAA1");
    expect(html).toContain("Alice Visitor");
    expect(html).not.toContain("HB-BBBB1");
    expect(html).not.toContain("Bob Visitor");
    expect(html).not.toContain("HB-LEGC1");
    expect(html).not.toContain("Legacy Person");
  });

  it("/admin/orders as browser B never contains browser A's order", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    const html = await asBrowser(cookieFor(B), () => render(Page));
    expect(html).toContain("HB-BBBB1");
    expect(html).not.toContain("HB-AAAA1");
    expect(html).not.toContain("Alice Visitor");
  });

  it("/admin/orders with no cookie shows seed data only", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    const html = await asBrowser(null, () => render(Page));
    expect(html).toContain("HB-SEED1");
    expect(html).not.toContain("HB-AAAA1");
    expect(html).not.toContain("HB-BBBB1");
  });

  it("/admin/reservations as browser A never contains browser B's booking", async () => {
    const { default: Page } = await import("@/app/admin/reservations/page");
    const html = await asBrowser(cookieFor(A), () => render(Page));
    expect(html).toContain("HR-SEED1");
    expect(html).toContain("Alice Booker");
    expect(html).not.toContain("HR-BBBB1");
    expect(html).not.toContain("Bob Booker");
    expect(html).not.toContain("Legacy Booker");
    // Header totals are scoped too: seed + A = 2 on the books.
    expect(html).toContain("2 total on the books");
  });

  it("/admin home counts only seed plus own records", async () => {
    const { default: Page } = await import("@/app/admin/page");
    const html = await asBrowser(cookieFor(A), () => render(Page));
    // seed + A received orders = 2 active; seed + A bookings today = 2.
    expect(html).toContain("2 active");
    expect(html).toContain("2 today");
  });

  it("a forged cookie claiming the seed marker gets seed data only", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    const html = await asBrowser("hb_visitor=seed", () => render(Page));
    expect(html).toContain("HB-SEED1");
    expect(html).not.toContain("HB-LEGC1");
    expect(html).not.toContain("HB-AAAA1");
  });
});

describe("admin POST APIs act only inside the caller's scope", () => {
  it("advancing another browser's order is 404 and changes nothing", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/route");
    const res = await POST(post("http://t/api/admin/orders/HB-AAAA1", { action: "advance" }, cookieFor(B)), ctx("HB-AAAA1"));
    expect(res.status).toBe(404);
    const unknown = await POST(post("http://t/api/admin/orders/HB-ZZZZZ", { action: "advance" }, cookieFor(B)), ctx("HB-ZZZZZ"));
    expect(unknown.status).toBe(404);
    // Out-of-scope and unknown are indistinguishable.
    expect(await res.json()).toEqual(await unknown.json());
    const row = db.prepare("SELECT status FROM orders WHERE id = 'HB-AAAA1'").get() as { status: string };
    expect(row.status).toBe("received");
  });

  it("cancelling another browser's order is 404", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/route");
    const res = await POST(post("http://t/x", { action: "cancel" }, cookieFor(B)), ctx("HB-AAAA1"));
    expect(res.status).toBe(404);
  });

  it("legacy (untagged) orders are 404 for everyone", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/route");
    for (const cookie of [cookieFor(A), cookieFor(B), null]) {
      const res = await POST(post("http://t/x", { action: "advance" }, cookie), ctx("HB-LEGC1"));
      expect(res.status).toBe(404);
    }
  });

  it("the owner and anyone acting on seed data still succeed", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/route");
    const own = await POST(post("http://t/x", { action: "advance" }, cookieFor(A)), ctx("HB-AAAA1"));
    expect(own.status).toBe(200);
    expect((await own.json()).status).toBe("preparing");
    const seed = await POST(post("http://t/x", { action: "advance" }, cookieFor(B)), ctx("HB-SEED1"));
    expect(seed.status).toBe(200);
  });

  it("changing another browser's reservation is 404 and changes nothing", async () => {
    const { POST } = await import("@/app/api/admin/reservations/[id]/route");
    const res = await POST(post("http://t/x", { status: "cancelled" }, cookieFor(B)), ctx("HR-AAAA1"));
    expect(res.status).toBe(404);
    const row = db.prepare("SELECT status FROM reservations WHERE id = 'HR-AAAA1'").get() as { status: string };
    expect(row.status).toBe("confirmed");
    const own = await POST(post("http://t/x", { status: "seated" }, cookieFor(A)), ctx("HR-AAAA1"));
    expect(own.status).toBe(200);
  });
});

describe("public detail routes require the matching visitor cookie", () => {
  it("GET /api/orders/[id] rejects a mismatched or missing cookie", async () => {
    const { GET } = await import("@/app/api/orders/[id]/route");
    expect((await GET(get("http://t/x", cookieFor(A)), ctx("HB-AAAA1"))).status).toBe(200);
    expect((await GET(get("http://t/x", cookieFor(B)), ctx("HB-AAAA1"))).status).toBe(404);
    expect((await GET(get("http://t/x", null), ctx("HB-AAAA1"))).status).toBe(404);
    expect((await GET(get("http://t/x", "hb_visitor=not-a-uuid"), ctx("HB-AAAA1"))).status).toBe(404);
    expect((await GET(get("http://t/x", null), ctx("HB-SEED1"))).status).toBe(200);
  });

  it("/order/confirmation/[id] is not found for another browser", async () => {
    const { default: Page } = await import("@/app/order/confirmation/[id]/page");
    const props = { params: Promise.resolve({ id: "HB-AAAA1" }), searchParams: Promise.resolve({}) };
    const html = await asBrowser(cookieFor(A), () => render(() => Page(props)));
    expect(html).toContain("HB-AAAA1");
    await expect(asBrowser(cookieFor(B), () => render(() => Page(props)))).rejects.toThrow(NOT_FOUND);
    await expect(asBrowser(null, () => render(() => Page(props)))).rejects.toThrow(NOT_FOUND);
  });

  it("/reservations/[id] is not found for another browser", async () => {
    const { default: Page } = await import("@/app/reservations/[id]/page");
    const props = { params: Promise.resolve({ id: "HR-AAAA1" }) };
    const html = await asBrowser(cookieFor(A), () => render(() => Page(props)));
    expect(html).toContain("Alice Booker");
    await expect(asBrowser(cookieFor(B), () => render(() => Page(props)))).rejects.toThrow(NOT_FOUND);
    await expect(asBrowser(null, () => render(() => Page(props)))).rejects.toThrow(NOT_FOUND);
  });
});

describe("create routes tag every record with the browser's visitor id", () => {
  function nextOpenDate(): string {
    // A Tuesday at least a week out: always open, never in the past.
    const d = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const booking = () => ({ name: "Test", phone: "555-0000", partySize: 2, date: nextOpenDate(), time: "18:00" });

  it("uses the cookie's visitor id when present", async () => {
    const { POST } = await import("@/app/api/reservations/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest(post("http://t/api/reservations", booking(), cookieFor(A))));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT visitor_id FROM reservations WHERE id = ?").get(id) as { visitor_id: string };
    expect(row.visitor_id).toBe(A);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("mints and sets a visitor id when the request has none", async () => {
    const { POST } = await import("@/app/api/reservations/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest(post("http://t/api/reservations", booking(), null)));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT visitor_id FROM reservations WHERE id = ?").get(id) as { visitor_id: string };
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`hb_visitor=${row.visitor_id}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(row.visitor_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
