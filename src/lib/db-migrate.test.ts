import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "./db";

/**
 * A database created before visitor tagging (the shape a running container
 * may still hold) gains the visitor_id column in place. Rows the seed script
 * wrote (ISO timestamps) become seed rows; rows the app wrote at runtime
 * (datetime('now') timestamps, i.e. visitor-entered) stay NULL, which no view
 * shows and the automatic purge does not delete.
 */
const PRE_TAGGING_SCHEMA = `
CREATE TABLE orders (
  id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
  customer_email TEXT, fulfillment TEXT NOT NULL, delivery_address TEXT,
  items TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, tip_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL, status TEXT NOT NULL, stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE reservations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  party_size INTEGER NOT NULL, reserved_date TEXT NOT NULL, reserved_time TEXT NOT NULL,
  notes TEXT, status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`;

describe("migrate", () => {
  it("adds visitor_id, marks seed rows, leaves runtime rows untagged", () => {
    const db = new Database(":memory:");
    db.exec(PRE_TAGGING_SCHEMA);
    db.prepare(
      `INSERT INTO orders (id, customer_name, customer_phone, fulfillment, items,
         subtotal_cents, total_cents, status, created_at, updated_at)
       VALUES ('HB-SEED1', 'S', '555', 'pickup', '[]', 1, 1, 'received',
         '2026-06-10T18:00:00.000Z', '2026-06-10T18:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO orders (id, customer_name, customer_phone, fulfillment, items,
         subtotal_cents, total_cents, status)
       VALUES ('HB-VIS01', 'V', '555', 'pickup', '[]', 1, 1, 'pending')`,
    ).run();
    db.prepare(
      `INSERT INTO reservations (id, name, phone, party_size, reserved_date, reserved_time, created_at)
       VALUES ('HR-SEED1', 'S', '555', 2, '2026-06-20', '18:00', '2026-06-10T18:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO reservations (id, name, phone, party_size, reserved_date, reserved_time)
       VALUES ('HR-VIS01', 'V', '555', 2, '2026-06-20', '18:00')`,
    ).run();

    migrate(db);
    migrate(db); // idempotent

    const tag = (table: string, id: string) =>
      (db.prepare(`SELECT visitor_id v FROM ${table} WHERE id = ?`).get(id) as { v: string | null }).v;
    expect(tag("orders", "HB-SEED1")).toBe("seed");
    expect(tag("orders", "HB-VIS01")).toBeNull();
    expect(tag("reservations", "HR-SEED1")).toBe("seed");
    expect(tag("reservations", "HR-VIS01")).toBeNull();
    // Nothing was deleted.
    expect((db.prepare("SELECT COUNT(*) c FROM orders").get() as { c: number }).c).toBe(2);
    expect((db.prepare("SELECT COUNT(*) c FROM reservations").get() as { c: number }).c).toBe(2);
  });
});
