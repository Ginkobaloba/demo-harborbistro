import type Database from "better-sqlite3";
import { SEED_VISITOR_ID } from "./visitor";

/**
 * Retention for visitor-entered data (D-016).
 *
 * Orders and reservations a visitor creates are deleted once they are older
 * than VISITOR_RETENTION_HOURS. Seed records (visitor_id = 'seed') are never
 * touched. Legacy rows from before visitor tagging (visitor_id IS NULL) are
 * left alone by the automatic run: they are already hidden from every view,
 * and deleting them is a one-time operator decision (`INCLUDE_LEGACY=1 npm
 * run db:purge-visitors`).
 *
 * Wiring: getDb() calls runRetentionIfDue() on every access, which runs the
 * purge on the first database use after the server starts (instrumentation.ts
 * opens the database at boot) and then at most once per
 * RETENTION_INTERVAL_MS. The script scripts/purge-visitor-data.ts runs it on
 * request.
 */

export const VISITOR_RETENTION_HOURS = 24;
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

export type PurgeOptions = {
  /** Reference time; defaults to now. */
  now?: Date;
  maxAgeHours?: number;
  /** Also delete legacy rows with no visitor id. Operator-only. */
  includeLegacy?: boolean;
  /** Count what would be deleted without deleting anything. */
  dryRun?: boolean;
};

export type PurgeResult = { orders: number; reservations: number; cutoff: string };

export function purgeExpiredVisitorData(
  db: Database.Database,
  opts: PurgeOptions = {},
): PurgeResult {
  const now = opts.now ?? new Date();
  const hours = opts.maxAgeHours ?? VISITOR_RETENTION_HOURS;
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  // `IS NOT ?` keeps NULL rows in the match; `IS NOT NULL AND <> ?` excludes
  // them. julianday() normalizes both timestamp styles in the tables (the
  // app's `2026-06-10 18:00:00` and the seed's ISO `2026-06-10T18:00:00.000Z`).
  const who = opts.includeLegacy
    ? "visitor_id IS NOT ?"
    : "visitor_id IS NOT NULL AND visitor_id <> ?";
  const where = `${who} AND julianday(created_at) < julianday(?)`;

  const counts = { orders: 0, reservations: 0 };
  db.transaction(() => {
    for (const table of ["orders", "reservations"] as const) {
      counts[table] = opts.dryRun
        ? (db
            .prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`)
            .get(SEED_VISITOR_ID, cutoff) as { c: number }).c
        : db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(SEED_VISITOR_ID, cutoff)
            .changes;
    }
  })();
  return { ...counts, cutoff };
}

declare global {
  var __harborRetentionLastRun: number | undefined;
}

/**
 * Run the automatic purge if it has not run in the last RETENTION_INTERVAL_MS
 * in this process. Never throws: a failed purge is logged and retried on the
 * next interval rather than breaking the request that triggered it.
 */
export function runRetentionIfDue(db: Database.Database, nowMs = Date.now()): boolean {
  if (process.env.HARBOR_RETENTION_DISABLED === "1") return false;
  const last = globalThis.__harborRetentionLastRun;
  if (last !== undefined && nowMs - last < RETENTION_INTERVAL_MS) return false;
  globalThis.__harborRetentionLastRun = nowMs;
  try {
    const r = purgeExpiredVisitorData(db, { now: new Date(nowMs) });
    if (r.orders + r.reservations > 0) {
      console.log(
        `[retention] deleted ${r.orders} orders and ${r.reservations} reservations created by visitors before ${r.cutoff}`,
      );
    }
  } catch (err) {
    console.error("[retention] visitor data purge failed", err);
  }
  return true;
}
