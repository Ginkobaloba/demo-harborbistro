import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import Stripe from "stripe";
import { NextRequest } from "next/server";

// Point the data layer at a throwaway DB before importing anything that opens
// it. db.ts reads HARBOR_DB_PATH at module-load, so the route and db modules
// are imported lazily in beforeAll. No Stripe network calls: signatures are
// built locally with Stripe.webhooks.generateTestHeaderString.
const TMP = path.join(os.tmpdir(), `harbor-webhook-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;

const SECRET = "whsec_test_local_only_not_a_real_secret";
const ORDER_ID = "HB-WHOOK";

type RouteModule = typeof import("./route");
let route: RouteModule;
let db: Database.Database;

function insertPending(id: string): void {
  db.prepare(
    `INSERT INTO orders
       (id, customer_name, customer_phone, fulfillment, items,
        subtotal_cents, tip_cents, total_cents, status)
     VALUES (?, 'Test', '555-0100', 'pickup', '[]', 1000, 0, 1000, 'pending')`,
  ).run(id);
}

function statusOf(id: string): string {
  const row = db.prepare("SELECT status FROM orders WHERE id = ?").get(id) as
    | { status: string }
    | undefined;
  return row!.status;
}

function eventBody(
  type: "checkout.session.completed" | "checkout.session.expired",
  orderId = ORDER_ID,
): string {
  return JSON.stringify({
    id: `evt_${type.replace(/\W/g, "_")}`,
    object: "event",
    type,
    data: {
      object: {
        id: "cs_test_webhook",
        object: "checkout.session",
        payment_status: type === "checkout.session.completed" ? "paid" : "unpaid",
        payment_intent: "pi_test_webhook",
        client_reference_id: orderId,
        metadata: { order_id: orderId },
      },
    },
  });
}

function post(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function signed(body: string, secret = SECRET): Record<string, string> {
  return {
    "stripe-signature": Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
    }),
  };
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  route = await import("./route");
  db = (await import("@/lib/db")).getDb();
});

beforeEach(() => {
  db.prepare("DELETE FROM orders").run();
  insertPending(ORDER_ID);
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/stripe without STRIPE_WEBHOOK_SECRET", () => {
  it("rejects a forged unsigned completed event with 503 and changes nothing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await route.POST(post(eventBody("checkout.session.completed")));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Webhook not configured");
    expect(statusOf(ORDER_ID)).toBe("pending");
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("also rejects a request carrying a (meaningless) signature header", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = eventBody("checkout.session.completed");
    const res = await route.POST(post(body, signed(body)));
    expect(res.status).toBe(503);
    expect(statusOf(ORDER_ID)).toBe("pending");
  });

  it("logs the misconfiguration at most once across requests", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await route.POST(post(eventBody("checkout.session.completed")));
    await route.POST(post(eventBody("checkout.session.completed")));
    // The one-time warning already fired in the first test of this file.
    expect(errSpy.mock.calls.length).toBe(0);
  });
});

describe("POST /api/webhooks/stripe with STRIPE_WEBHOOK_SECRET set", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("rejects a missing signature with 400 and changes nothing", async () => {
    const res = await route.POST(post(eventBody("checkout.session.completed")));
    expect(res.status).toBe(400);
    expect(statusOf(ORDER_ID)).toBe("pending");
  });

  it("rejects a garbage signature with 400", async () => {
    const res = await route.POST(
      post(eventBody("checkout.session.completed"), {
        "stripe-signature": "t=1,v1=deadbeef",
      }),
    );
    expect(res.status).toBe(400);
    expect(statusOf(ORDER_ID)).toBe("pending");
  });

  it("rejects a signature made with a different secret", async () => {
    const body = eventBody("checkout.session.completed");
    const res = await route.POST(post(body, signed(body, "whsec_wrong")));
    expect(res.status).toBe(400);
    expect(statusOf(ORDER_ID)).toBe("pending");
  });

  it("rejects a valid signature over a tampered body", async () => {
    const original = eventBody("checkout.session.completed", "HB-OTHER");
    const tampered = eventBody("checkout.session.completed");
    const res = await route.POST(post(tampered, signed(original)));
    expect(res.status).toBe(400);
    expect(statusOf(ORDER_ID)).toBe("pending");
  });

  it("applies a correctly signed completed event", async () => {
    const body = eventBody("checkout.session.completed");
    const res = await route.POST(post(body, signed(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: true });
    expect(statusOf(ORDER_ID)).toBe("received");
  });

  it("is idempotent: a replayed signed event does not double-apply", async () => {
    const body = eventBody("checkout.session.completed");
    await route.POST(post(body, signed(body)));
    db.prepare("UPDATE orders SET status = 'preparing' WHERE id = ?").run(ORDER_ID);

    const replay = await route.POST(post(body, signed(body)));
    expect(replay.status).toBe(200);
    expect(statusOf(ORDER_ID)).toBe("preparing");
  });

  it("a late signed expired event does not cancel a paid order", async () => {
    const paid = eventBody("checkout.session.completed");
    await route.POST(post(paid, signed(paid)));
    const expired = eventBody("checkout.session.expired");
    const res = await route.POST(post(expired, signed(expired)));
    expect(res.status).toBe(200);
    expect(statusOf(ORDER_ID)).toBe("received");
  });

  it("cancels a still-pending order on a signed expired event", async () => {
    const body = eventBody("checkout.session.expired");
    const res = await route.POST(post(body, signed(body)));
    expect(res.status).toBe(200);
    expect(statusOf(ORDER_ID)).toBe("cancelled");
  });
});
