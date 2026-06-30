import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";

// Point the data layer at a throwaway DB before importing anything that opens
// it. db.ts reads HARBOR_DB_PATH at module-load, so this must run first; the
// app modules are pulled in lazily via dynamic import in beforeAll.
const TMP = path.join(os.tmpdir(), `harbor-orders-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;

type OrdersModule = typeof import("./orders");
let orders: OrdersModule;
let db: Database.Database;

function insert(id: string, status: string, ageMinutes = 0): void {
  const created = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  db.prepare(
    `INSERT INTO orders
       (id, customer_name, customer_phone, fulfillment, items,
        subtotal_cents, tip_cents, total_cents, status, created_at, updated_at)
     VALUES (?, 'Test', '555-0100', 'pickup', '[]', 1000, 0, 1000, ?, ?, ?)`,
  ).run(id, status, created, created);
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  orders = await import("./orders");
  db = (await import("./db")).getDb();
});

beforeEach(() => {
  db.prepare("DELETE FROM orders").run();
});

describe("nextOrderStatus", () => {
  it("walks received -> preparing -> ready -> completed", () => {
    expect(orders.nextOrderStatus("received")).toBe("preparing");
    expect(orders.nextOrderStatus("preparing")).toBe("ready");
    expect(orders.nextOrderStatus("ready")).toBe("completed");
  });

  it("returns null at the ends of the line", () => {
    expect(orders.nextOrderStatus("completed")).toBeNull();
    expect(orders.nextOrderStatus("cancelled")).toBeNull();
    expect(orders.nextOrderStatus("pending")).toBeNull();
  });
});

describe("advanceOrder", () => {
  it("steps a paid order through the kitchen flow", () => {
    insert("HB-AAAAA", "received");
    expect(orders.advanceOrder("HB-AAAAA").status).toBe("preparing");
    expect(orders.advanceOrder("HB-AAAAA").status).toBe("ready");
    expect(orders.advanceOrder("HB-AAAAA").status).toBe("completed");
  });

  it("refuses to advance a completed order", () => {
    insert("HB-BBBBB", "completed");
    expect(() => orders.advanceOrder("HB-BBBBB")).toThrow(
      orders.OrderTransitionError,
    );
  });

  it("refuses an unknown order", () => {
    expect(() => orders.advanceOrder("HB-NOPE0")).toThrow(
      orders.OrderTransitionError,
    );
  });
});

describe("cancelActiveOrder", () => {
  it("cancels an in-progress order", () => {
    insert("HB-CCCCC", "preparing");
    expect(orders.cancelActiveOrder("HB-CCCCC").status).toBe("cancelled");
  });

  it("will not cancel a completed order", () => {
    insert("HB-DDDDD", "completed");
    expect(() => orders.cancelActiveOrder("HB-DDDDD")).toThrow(
      orders.OrderTransitionError,
    );
  });
});

describe("kitchen queries", () => {
  it("lists only active orders, oldest first, and counts by status", () => {
    insert("HB-OLD00", "received", 30);
    insert("HB-NEW00", "preparing", 5);
    insert("HB-READY", "ready", 10);
    insert("HB-DONE0", "completed", 60);
    insert("HB-VOID0", "cancelled", 90);

    const active = orders.getActiveOrders();
    expect(active.map((o) => o.id)).toEqual(["HB-OLD00", "HB-READY", "HB-NEW00"]);

    const counts = orders.getKitchenCounts();
    expect(counts).toEqual({ received: 1, preparing: 1, ready: 1 });

    const recent = orders.getRecentOrders();
    expect(recent.map((o) => o.id).sort()).toEqual(["HB-DONE0", "HB-VOID0"]);
  });
});
