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

/**
 * The WHOLE order row, every column. `statusOf` above answers "did the status
 * change"; this answers "did anything change", which is the property the guard
 * actually owes us. A 400 that silently wrote `stripe_payment_intent_id` or
 * bumped `updated_at` would sail past a status-only assertion.
 */
function rowOf(id: string): Record<string, unknown> {
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<
    string,
    unknown
  >;
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

/**
 * THE PROPERTY. Order state must never change as a result of an event whose
 * signature was not verified against the configured signing secret.
 *
 * The cases above already assert `statusOf(...) === "pending"`, which is a
 * state assertion, not a status-code-only one. These go further: they snapshot
 * the ENTIRE row before the request and compare it column-for-column after, so
 * a rejection that nonetheless wrote `stripe_payment_intent_id`,
 * `stripe_checkout_session_id` or `updated_at` fails here even though the
 * status never moved and the response was a correct 400.
 *
 * Each forged body is a `checkout.session.completed` with
 * `payment_status: "paid"` and the order id in metadata, i.e. exactly the event
 * that WOULD flip the row to `received` if it were allowed through. Neuter the
 * verification in route.ts and these go red.
 */
describe("unverified events leave the order row byte-for-byte unchanged", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("no stripe-signature header: 400 and the whole row is identical", async () => {
    const before = rowOf(ORDER_ID);
    const res = await route.POST(post(eventBody("checkout.session.completed")));
    expect(res.status).toBe(400);
    expect(rowOf(ORDER_ID)).toStrictEqual(before);
  });

  it("malformed stripe-signature header: 400 and the whole row is identical", async () => {
    const before = rowOf(ORDER_ID);
    const res = await route.POST(
      post(eventBody("checkout.session.completed"), {
        "stripe-signature": "t=1,v1=deadbeef",
      }),
    );
    expect(res.status).toBe(400);
    expect(rowOf(ORDER_ID)).toStrictEqual(before);
  });

  it("signature made with the wrong key: 400 and the whole row is identical", async () => {
    const before = rowOf(ORDER_ID);
    const body = eventBody("checkout.session.completed");
    const res = await route.POST(
      post(body, signed(body, `whsec_${"z".repeat(40)}`)),
    );
    expect(res.status).toBe(400);
    expect(rowOf(ORDER_ID)).toStrictEqual(before);
  });

  it("valid signature over a different body: 400 and the whole row is identical", async () => {
    const before = rowOf(ORDER_ID);
    const original = eventBody("checkout.session.completed", "HB-OTHER");
    const tampered = eventBody("checkout.session.completed");
    const res = await route.POST(post(tampered, signed(original)));
    expect(res.status).toBe(400);
    expect(rowOf(ORDER_ID)).toStrictEqual(before);
  });

  it("control: the same body WITH a correct signature does change the row", async () => {
    // Without this, the four assertions above would also pass against a route
    // that ignored the body entirely. This proves the forged event is one that
    // really would mutate state if it were let through.
    const before = rowOf(ORDER_ID);
    const body = eventBody("checkout.session.completed");
    const res = await route.POST(post(body, signed(body)));
    expect(res.status).toBe(200);
    expect(rowOf(ORDER_ID)).not.toStrictEqual(before);
    expect(statusOf(ORDER_ID)).toBe("received");
  });
});

/**
 * Secondary control at the route boundary: a configured-but-malformed
 * STRIPE_WEBHOOK_SECRET reads as unconfigured, so the endpoint 503s rather
 * than using a placeholder as an HMAC key. The request here is signed WITH
 * that malformed secret, so the signature itself is valid for it: only the
 * format/length floor can be what rejects this.
 */
describe("malformed STRIPE_WEBHOOK_SECRET is treated as unconfigured", () => {
  for (const bad of ["whsec_xxx", "whsec_short", "x".repeat(48), " whsec_" + "a".repeat(40)]) {
    it(`503s for a request correctly signed with ${JSON.stringify(bad)}`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      process.env.STRIPE_WEBHOOK_SECRET = bad;
      const before = rowOf(ORDER_ID);
      const body = eventBody("checkout.session.completed");
      const res = await route.POST(post(body, signed(body, bad)));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("Webhook not configured");
      expect(rowOf(ORDER_ID)).toStrictEqual(before);
    });
  }
});
