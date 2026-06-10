/**
 * Integrity gate for the seeded database. Run after db:seed; exits nonzero
 * on any violation. Checks the spec's success criteria that live at the
 * data layer: 60 items / 7 courses / 30+ photos / entree price band, plus
 * order and reservation invariants.
 *
 * Run: npm run db:verify
 */
import { getDb } from "../src/lib/db";
import { COURSES } from "../src/lib/types";

const db = getDb();
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failures.push(`${label}${detail ? ` (${detail})` : ""}`);
}

// Menu items
const itemCount = (db.prepare("SELECT COUNT(*) c FROM menu_items").get() as { c: number }).c;
check("60 menu items", itemCount === 60, `got ${itemCount}`);

const courseRows = db
  .prepare("SELECT course, COUNT(*) c FROM menu_items GROUP BY course")
  .all() as { course: string; c: number }[];
check(
  "all 7 courses present",
  courseRows.length === COURSES.length &&
    courseRows.every((r) => (COURSES as readonly string[]).includes(r.course)),
  courseRows.map((r) => `${r.course}:${r.c}`).join(", "),
);

const photoCount = (db
  .prepare("SELECT COUNT(*) c FROM menu_items WHERE photo_url IS NOT NULL")
  .get() as { c: number }).c;
check("30+ items have photos", photoCount >= 30, `got ${photoCount}`);

const entreeBand = db
  .prepare(
    "SELECT MIN(price_cents) lo, MAX(price_cents) hi FROM menu_items WHERE course = 'entrees'",
  )
  .get() as { lo: number; hi: number };
check(
  "entrees within $14-$36",
  entreeBand.lo >= 1400 && entreeBand.hi <= 3600,
  `$${entreeBand.lo / 100}-$${entreeBand.hi / 100}`,
);

const badJson = (db
  .prepare(
    "SELECT COUNT(*) c FROM menu_items WHERE json_valid(customization_options) = 0",
  )
  .get() as { c: number }).c;
check("customization_options all valid JSON", badJson === 0, `${badJson} invalid`);

const featured = (db
  .prepare("SELECT COUNT(*) c FROM menu_items WHERE is_featured = 1")
  .get() as { c: number }).c;
check("3-6 featured items for the home preview", featured >= 3 && featured <= 6, `got ${featured}`);

const veganNotVegetarian = (db
  .prepare("SELECT COUNT(*) c FROM menu_items WHERE is_vegan = 1 AND is_vegetarian = 0")
  .get() as { c: number }).c;
check("every vegan item is also vegetarian", veganNotVegetarian === 0, `${veganNotVegetarian} violations`);

// Orders
const orderCount = (db.prepare("SELECT COUNT(*) c FROM orders").get() as { c: number }).c;
check("20 orders", orderCount === 20, `got ${orderCount}`);

const statusRows = db
  .prepare("SELECT DISTINCT status FROM orders")
  .all() as { status: string }[];
check(
  "orders cover all 4 statuses",
  statusRows.length === 4,
  statusRows.map((r) => r.status).join(", "),
);

const badTotals = (db
  .prepare(
    "SELECT COUNT(*) c FROM orders WHERE total_cents != subtotal_cents + tip_cents",
  )
  .get() as { c: number }).c;
check("order totals = subtotal + tip", badTotals === 0, `${badTotals} mismatched`);

const badOrderItems = (db
  .prepare("SELECT COUNT(*) c FROM orders WHERE json_valid(items) = 0")
  .get() as { c: number }).c;
check("order items all valid JSON", badOrderItems === 0, `${badOrderItems} invalid`);

// Every order line item must reference a real menu slug.
const orphanSlugs = (db
  .prepare(
    `SELECT COUNT(*) c FROM orders o, json_each(o.items) li
     WHERE json_extract(li.value, '$.slug') NOT IN (SELECT slug FROM menu_items)`,
  )
  .get() as { c: number }).c;
check("order line items reference real menu slugs", orphanSlugs === 0, `${orphanSlugs} orphans`);

// Reservations
const resCount = (db.prepare("SELECT COUNT(*) c FROM reservations").get() as { c: number }).c;
check("15 reservations", resCount === 15, `got ${resCount}`);

const resWindow = db
  .prepare("SELECT MIN(reserved_date) lo, MAX(reserved_date) hi FROM reservations")
  .get() as { lo: string; hi: string };
const today = new Date().toISOString().slice(0, 10);
const twoWeeks = new Date(Date.now() + 15 * 24 * 60 * 60_000)
  .toISOString()
  .slice(0, 10);
check(
  "reservations within the next 2 weeks",
  resWindow.lo > today && resWindow.hi <= twoWeeks,
  `${resWindow.lo}..${resWindow.hi}`,
);

if (failures.length > 0) {
  console.error("Seed verification FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Seed verification passed: all data-layer success criteria hold.");
