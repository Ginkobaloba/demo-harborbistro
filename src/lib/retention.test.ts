import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";

// Throwaway DB; the automatic hourly run is disabled so each test drives the
// purge explicitly.
const TMP = path.join(os.tmpdir(), `harbor-retention-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;
process.env.HARBOR_RETENTION_DISABLED = "1";

type RetentionModule = typeof import("./retention");
let retention: RetentionModule;
let db: Database.Database;

const NOW = new Date("2026-09-18T12:00:00.000Z");
const VISITOR = "33333333-3333-4333-8333-333333333333";

/** SQLite datetime('now') style, which is what the app's inserts produce. */
function sqliteTime(hoursAgo: number): string {
  return new Date(NOW.getTime() - hoursAgo * 3600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

function order(id: string, visitor: string | null, createdAt: string) {
  db.prepare(
    `INSERT INTO orders (id, customer_name, customer_phone, fulfillment, items,
       subtotal_cents, tip_cents, total_cents, status, visitor_id, created_at, updated_at)
     VALUES (?, 'X', '555', 'pickup', '[]', 1, 0, 1, 'received', ?, ?, ?)`,
  ).run(id, visitor, createdAt, createdAt);
}

function reservation(id: string, visitor: string | null, createdAt: string) {
  db.prepare(
    `INSERT INTO reservations (id, name, phone, party_size, reserved_date, reserved_time,
       status, visitor_id, created_at)
     VALUES (?, 'X', '555', 2, '2026-09-20', '18:00', 'confirmed', ?, ?)`,
  ).run(id, visitor, createdAt);
}

const ids = (table: string) =>
  (db.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as { id: string }[]).map(
    (r) => r.id,
  );

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  retention = await import("./retention");
  db = (await import("./db")).getDb();
});

beforeEach(() => {
  db.prepare("DELETE FROM orders").run();
  db.prepare("DELETE FROM reservations").run();
  // Old seed rows (ISO timestamps, as the seed writes them) must survive.
  const seedTime = new Date(NOW.getTime() - 72 * 3600_000).toISOString();
  order("HB-SEEDO", "seed", seedTime);
  reservation("HR-SEEDO", "seed", seedTime);
  // Visitor rows: one past 24h, one inside it.
  order("HB-OLDV1", VISITOR, sqliteTime(25));
  order("HB-NEWV1", VISITOR, sqliteTime(23));
  reservation("HR-OLDV1", VISITOR, sqliteTime(48));
  reservation("HR-NEWV1", VISITOR, sqliteTime(1));
  // Legacy rows (pre-tagging, visitor_id NULL), old.
  order("HB-LEGCY", null, sqliteTime(100));
  reservation("HR-LEGCY", null, sqliteTime(100));
});

describe("purgeExpiredVisitorData", () => {
  it("deletes only visitor rows older than 24h", () => {
    const r = retention.purgeExpiredVisitorData(db, { now: NOW });
    expect(r).toMatchObject({ orders: 1, reservations: 1 });
    expect(ids("orders")).toEqual(["HB-LEGCY", "HB-NEWV1", "HB-SEEDO"]);
    expect(ids("reservations")).toEqual(["HR-LEGCY", "HR-NEWV1", "HR-SEEDO"]);
  });

  it("never deletes seed rows, however old", () => {
    const farFuture = new Date(NOW.getTime() + 365 * 24 * 3600_000);
    retention.purgeExpiredVisitorData(db, { now: farFuture });
    expect(ids("orders")).toContain("HB-SEEDO");
    expect(ids("reservations")).toContain("HR-SEEDO");
  });

  it("leaves legacy rows unless the operator opts in", () => {
    retention.purgeExpiredVisitorData(db, { now: NOW });
    expect(ids("orders")).toContain("HB-LEGCY");
    retention.purgeExpiredVisitorData(db, { now: NOW, includeLegacy: true });
    expect(ids("orders")).toEqual(["HB-NEWV1", "HB-SEEDO"]);
    expect(ids("reservations")).toEqual(["HR-NEWV1", "HR-SEEDO"]);
  });

  it("dry run counts without deleting", () => {
    const r = retention.purgeExpiredVisitorData(db, {
      now: NOW,
      dryRun: true,
      includeLegacy: true,
    });
    expect(r).toMatchObject({ orders: 2, reservations: 2 });
    expect(ids("orders")).toHaveLength(4);
  });
});

describe("runRetentionIfDue", () => {
  it("runs at most once per interval", () => {
    delete process.env.HARBOR_RETENTION_DISABLED;
    try {
      globalThis.__harborRetentionLastRun = undefined;
      const t0 = Date.now();
      expect(retention.runRetentionIfDue(db, t0)).toBe(true);
      expect(retention.runRetentionIfDue(db, t0 + 60_000)).toBe(false);
      expect(
        retention.runRetentionIfDue(db, t0 + retention.RETENTION_INTERVAL_MS),
      ).toBe(true);
    } finally {
      process.env.HARBOR_RETENTION_DISABLED = "1";
    }
  });
});
