import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import Stripe from "stripe";
import { NextRequest } from "next/server";

/**
 * POST /api/checkout against a throwaway database and a controlled Stripe
 * client (D-017):
 *   - Stripe unreachable (a real SDK client aimed at a closed local port) or
 *     failing for any other reason gives a JSON 503, no error internals, and
 *     zero order rows;
 *   - the happy path still writes exactly one pending, tagged order carrying
 *     the session id, and hands back the hosted URL;
 *   - oversized fields and bodies are refused before Stripe is called and
 *     store nothing; fields at their exact limits are accepted.
 */
const TMP = path.join(os.tmpdir(), `harbor-checkout-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;
process.env.HARBOR_RETENTION_DISABLED = "1";

const stripeState = vi.hoisted(() => ({
  create: null as null | ((params: unknown) => Promise<unknown>),
  client: null as unknown,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () =>
    stripeState.client ?? {
      checkout: {
        sessions: {
          create: (params: unknown) => {
            if (!stripeState.create) throw new Error("test did not set a Stripe behaviour");
            return stripeState.create(params);
          },
        },
      },
    },
}));

const VISITOR = "33333333-3333-4333-8333-333333333333";
const ITEM = "test-chowder";
const BURGER = "test-burger";

type RouteModule = typeof import("./route");
type Limits = typeof import("@/lib/request-body");
let route: RouteModule;
let limits: Limits;
let db: Database.Database;

function orderCount(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM orders").get() as { c: number }).c;
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    lines: [{ slug: ITEM, quantity: 2 }],
    customerName: "Test Diner",
    customerPhone: "555-0100",
    customerEmail: "diner@example.com",
    fulfillment: "pickup",
    tipCents: 300,
    ...overrides,
  };
}

function checkout(body: unknown, init: { raw?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `hb_visitor=${VISITOR}`,
      ...(init.headers ?? {}),
    },
    body: init.raw ?? JSON.stringify(body),
  });
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  db = (await import("@/lib/db")).getDb();
  db.prepare(
    `INSERT INTO menu_items (slug, name, course, description, price_cents, customization_options)
     VALUES (?, 'Test Chowder', 'entrees', 'A bowl for tests.', 1800, '[]')`,
  ).run(ITEM);
  db.prepare(
    `INSERT INTO menu_items (slug, name, course, description, price_cents, customization_options)
     VALUES (?, 'Test Burger', 'entrees', 'A burger for tests.', 1700, ?)`,
  ).run(
    BURGER,
    JSON.stringify([
      {
        id: "extras",
        label: "Extras",
        type: "multi",
        choices: [
          { id: "bacon", label: "Add bacon", priceCents: 300 },
          { id: "egg", label: "Add egg", priceCents: 200 },
        ],
      },
    ]),
  );
  route = await import("./route");
  limits = await import("@/lib/request-body");
});

beforeEach(() => {
  db.prepare("DELETE FROM orders").run();
  stripeState.create = null;
  stripeState.client = null;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_only_not_a_real_key");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
  vi.stubEnv("PUBLIC_BASE_URL", "https://harbor.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/checkout when Stripe fails", () => {
  it("answers a JSON 503 and stores no order when Stripe is unreachable", async () => {
    // A real SDK client aimed at a closed port: the genuine connection-error
    // path (StripeConnectionError), no network leaves the machine.
    stripeState.client = new Stripe("sk_test_local_only_not_a_real_key", {
      host: "127.0.0.1",
      port: 1,
      protocol: "http",
      maxNetworkRetries: 0,
      timeout: 5000,
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await route.POST(checkout(validBody()));

    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const text = await res.text();
    const json = JSON.parse(text) as { error?: string; url?: string };
    expect(json.error).toMatch(/payment service is temporarily unavailable/i);
    expect(json.url).toBeUndefined();
    for (const leak of ["127.0.0.1", "ECONNREFUSED", "connection to Stripe", "StripeConnectionError", "sk_test_"]) {
      expect(text).not.toContain(leak);
    }
    expect(orderCount()).toBe(0);
    expect(logged).toHaveBeenCalled();
    expect(String(logged.mock.calls[0][0])).not.toContain("sk_test_");
  }, 20_000);

  it("answers 503 without leaking the message for any other Stripe error", async () => {
    stripeState.create = async () => {
      throw new Error("SENTINEL-internal-detail sk_test_leakme at /srv/app/node_modules/stripe");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await route.POST(checkout(validBody()));

    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("SENTINEL");
    expect(text).not.toContain("sk_test_leakme");
    expect(text).not.toContain("node_modules");
    expect(orderCount()).toBe(0);
  });

  it("answers 503 and stores nothing when Stripe returns a session with no URL", async () => {
    stripeState.create = async () => ({ id: "cs_test_nourl", url: null });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await route.POST(checkout(validBody()));

    expect(res.status).toBe(503);
    expect(orderCount()).toBe(0);
  });
});

describe("POST /api/checkout happy path (mocked Stripe)", () => {
  it("opens the session, then stores one pending, tagged order with the session id", async () => {
    const calls: Array<Record<string, unknown>> = [];
    stripeState.create = async (params) => {
      calls.push(params as Record<string, unknown>);
      // The row must not exist yet while Stripe is being called.
      expect(orderCount()).toBe(0);
      return { id: "cs_test_happy", url: "https://checkout.stripe.test/c/cs_test_happy" };
    };

    const res = await route.POST(checkout(validBody()));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; orderId: string };
    expect(json.url).toBe("https://checkout.stripe.test/c/cs_test_happy");
    expect(json.orderId).toMatch(/^HB-[2-9A-HJKMNP-Z]{5}$/);

    expect(calls).toHaveLength(1);
    const params = calls[0];
    expect(params.client_reference_id).toBe(json.orderId);
    expect(params.metadata).toEqual({ order_id: json.orderId, fulfillment: "pickup" });
    expect(params.success_url).toBe(
      `https://harbor.test/order/confirmation/${json.orderId}?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(params.cancel_url).toBe(`https://harbor.test/order?canceled=${json.orderId}`);
    const lineItems = params.line_items as Array<{ quantity: number; price_data: { unit_amount: number } }>;
    expect(lineItems.map((l) => [l.quantity, l.price_data.unit_amount])).toEqual([
      [2, 1800],
      [1, 300],
    ]);

    expect(orderCount()).toBe(1);
    const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(json.orderId) as Record<string, unknown>;
    expect(row.status).toBe("pending");
    expect(row.stripe_checkout_session_id).toBe("cs_test_happy");
    expect(row.visitor_id).toBe(VISITOR);
    expect(row.customer_name).toBe("Test Diner");
    expect(row.subtotal_cents).toBe(3600);
    expect(row.tip_cents).toBe(300);
    expect(row.total_cents).toBe(3900);
  });
});

describe("POST /api/checkout input caps", () => {
  const fieldCases = [
    ["customerName", "name"],
    ["customerPhone", "phone"],
    ["customerEmail", "email"],
    ["deliveryAddress", "address"],
  ] as const;

  for (const [field, key] of fieldCases) {
    it(`rejects ${field} one character over its limit with 400, before Stripe, storing nothing`, async () => {
      const create = vi.fn();
      stripeState.create = create;
      const max = limits.FIELD_LIMITS[key];
      const res = await route.POST(
        checkout(validBody({ fulfillment: "delivery", deliveryAddress: "1 Pier Rd", [field]: "x".repeat(max + 1) })),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(new RegExp(`at most ${max} characters`));
      expect(create).not.toHaveBeenCalled();
      expect(orderCount()).toBe(0);
    });
  }

  it("accepts every free-text field at exactly its limit", async () => {
    stripeState.create = async () => ({ id: "cs_test_edge", url: "https://checkout.stripe.test/c/edge" });
    const L = limits.FIELD_LIMITS;
    const res = await route.POST(
      checkout(
        validBody({
          customerName: "n".repeat(L.name),
          customerPhone: "5".repeat(L.phone),
          customerEmail: "e".repeat(L.email),
          fulfillment: "delivery",
          deliveryAddress: "a".repeat(L.address),
        }),
      ),
    );
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT * FROM orders").get() as Record<string, string>;
    expect(row.customer_name).toHaveLength(L.name);
    expect(row.customer_phone).toHaveLength(L.phone);
    expect(row.customer_email).toHaveLength(L.email);
    expect(row.delivery_address).toHaveLength(L.address);
  });

  it("refuses a non-string name instead of storing \"[object Object]\"", async () => {
    stripeState.create = vi.fn();
    const res = await route.POST(checkout(validBody({ customerName: { a: 1 } })));
    expect(res.status).toBe(400);
    expect(orderCount()).toBe(0);
  });

  it("refuses a 1 MB name with 413 and stores nothing", async () => {
    const create = vi.fn();
    stripeState.create = create;
    const res = await route.POST(checkout(validBody({ customerName: "x".repeat(1024 * 1024) })));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/too large/i);
    expect(create).not.toHaveBeenCalled();
    expect(orderCount()).toBe(0);
  });

  // In-process only: on a real server Node's framing stops at the declared
  // length, so an understated Content-Length yields truncated JSON (400).
  // test/server/body-caps.server.test.ts covers the real-server behaviour.
  it("counts the streamed bytes rather than trusting Content-Length (in-process)", async () => {
    stripeState.create = vi.fn();
    const raw = JSON.stringify(validBody({ customerName: "x".repeat(64 * 1024) }));
    const res = await route.POST(checkout(null, { raw, headers: { "content-length": "10" } }));
    expect(res.status).toBe(413);
    expect(orderCount()).toBe(0);
  });

  it("refuses a cart with more lines than MAX_CART_LINES", async () => {
    stripeState.create = vi.fn();
    const { MAX_CART_LINES } = await import("@/lib/orders");
    const lines = Array.from({ length: MAX_CART_LINES + 1 }, () => ({ slug: ITEM, quantity: 1 }));
    const res = await route.POST(checkout(validBody({ lines })));
    expect(res.status).toBe(400);
    expect(orderCount()).toBe(0);
  });
});

describe("POST /api/checkout tip validation (W4)", () => {
  const happy = async () => ({ id: "cs_test_tip", url: "https://checkout.stripe.test/c/tip" });

  for (const [label, tip] of [
    ["a boolean", true],
    ["an array", [5]],
    ["a numeric string", " 7 "],
    ["a fraction", 12.5],
    ["a negative number", -500],
    ["one cent over the cap", 100_001],
    ["an absurd amount", 1e20],
    ["an object", { cents: 5 }],
  ] as const) {
    it(`refuses ${label} with 400, before Stripe, storing nothing`, async () => {
      const create = vi.fn(happy);
      stripeState.create = create;
      const res = await route.POST(checkout(validBody({ tipCents: tip })));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/tip/i);
      expect(create).not.toHaveBeenCalled();
      expect(orderCount()).toBe(0);
    });
  }

  it("accepts a tip of exactly MAX_TIP_CENTS", async () => {
    const { MAX_TIP_CENTS } = await import("@/lib/orders");
    stripeState.create = happy;
    const res = await route.POST(checkout(validBody({ tipCents: MAX_TIP_CENTS })));
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT tip_cents, total_cents FROM orders").get() as Record<string, number>;
    expect(row.tip_cents).toBe(MAX_TIP_CENTS);
    expect(row.total_cents).toBe(3600 + MAX_TIP_CENTS);
  });

  it("treats an absent or null tip as no tip", async () => {
    stripeState.create = happy;
    for (const tipCents of [undefined, null, 0]) {
      db.prepare("DELETE FROM orders").run();
      const res = await route.POST(checkout(validBody({ tipCents })));
      expect(res.status).toBe(200);
      const row = db.prepare("SELECT tip_cents, total_cents FROM orders").get() as Record<string, number>;
      expect(row).toEqual({ tip_cents: 0, total_cents: 3600 });
    }
  });
});

describe("POST /api/checkout add-on de-duplication (W5)", () => {
  it("charges a repeated add-on once", async () => {
    const calls: Array<Record<string, unknown>> = [];
    stripeState.create = async (params) => {
      calls.push(params as Record<string, unknown>);
      return { id: "cs_test_dedupe", url: "https://checkout.stripe.test/c/dedupe" };
    };
    const lines = [
      { slug: BURGER, quantity: 1, selections: { extras: Array.from({ length: 200 }, () => "bacon") } },
      { slug: BURGER, quantity: 1, selections: { extras: ["bacon", "egg", "bacon", "egg"] } },
    ];
    const res = await route.POST(checkout(validBody({ lines, tipCents: 0 })));
    expect(res.status).toBe(200);
    const items = calls[0].line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(items.map((l) => l.price_data.unit_amount)).toEqual([1700 + 300, 1700 + 300 + 200]);
    const row = db.prepare("SELECT items, subtotal_cents FROM orders").get() as { items: string; subtotal_cents: number };
    expect(row.subtotal_cents).toBe(2000 + 2200);
    const stored = JSON.parse(row.items) as Array<{ selections: Record<string, string[]> }>;
    expect(stored[0].selections.extras).toEqual(["bacon"]);
    expect(stored[1].selections.extras).toEqual(["bacon", "egg"]);
  });
});

describe("POST /api/checkout order-id minting failure (W3)", () => {
  it("answers the JSON 500 used for save failures, before Stripe, with no row", async () => {
    const orders = await import("@/lib/orders");
    // Make every candidate id collide: the minting loop gives up.
    const realGetDb = (await import("@/lib/db")).getDb;
    const conn = realGetDb();
    const prepare = conn.prepare.bind(conn);
    const spy = vi.spyOn(conn, "prepare").mockImplementation(((sql: string) => {
      if (sql === "SELECT 1 FROM orders WHERE id = ?") return { get: () => ({ 1: 1 }) };
      return prepare(sql);
    }) as typeof conn.prepare);
    const create = vi.fn();
    stripeState.create = create;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => orders.unusedOrderId()).toThrow();
    const res = await route.POST(checkout(validBody()));
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Your order could not be saved. Please try again.",
    );
    expect(create).not.toHaveBeenCalled();
    expect(orderCount()).toBe(0);
    expect(String(logged.mock.calls[0][0])).not.toContain("Test Diner");
  });
});
