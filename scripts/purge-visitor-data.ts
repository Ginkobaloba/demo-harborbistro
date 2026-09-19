/**
 * Run the visitor-data retention purge now (docs/decisions.md D-016).
 *
 *   npm run db:purge-visitors                   # delete visitor rows older than 24h
 *   DRY_RUN=1 npm run db:purge-visitors         # count only, delete nothing
 *   INCLUDE_LEGACY=1 npm run db:purge-visitors  # ALSO delete pre-tagging rows
 *
 * Options are environment variables, not CLI flags, on purpose: Windows
 * PowerShell 5.1 drops `npm run x -- --flag`, which would turn a dry run into
 * a real one.
 *
 * INCLUDE_LEGACY removes rows written before visitor tagging existed
 * (visitor_id IS NULL). Those rows are already hidden from every view; deleting
 * them is a one-time operator decision, so the automatic hourly purge never
 * does it. Seed rows are never deleted.
 *
 * Targets the database at HARBOR_DB_PATH (default data/harborbistro.db).
 */
import { DB_PATH, getDb } from "../src/lib/db";
import { purgeExpiredVisitorData } from "../src/lib/retention";

// Keep getDb()'s own automatic run from deleting before a dry run counts.
process.env.HARBOR_RETENTION_DISABLED = "1";

const dryRun = process.env.DRY_RUN === "1";
const includeLegacy = process.env.INCLUDE_LEGACY === "1";

const result = purgeExpiredVisitorData(getDb(), { dryRun, includeLegacy });
const verb = dryRun ? "Would delete" : "Deleted";
console.log(
  `${verb} ${result.orders} orders and ${result.reservations} reservations ` +
    `created by visitors before ${result.cutoff}` +
    `${includeLegacy ? " (including legacy untagged rows)" : ""} in ${DB_PATH}.`,
);
