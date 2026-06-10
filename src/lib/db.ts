import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH =
  process.env.HARBOR_DB_PATH ??
  path.join(process.cwd(), "data", "harborbistro.db");

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  course TEXT NOT NULL CHECK (course IN
    ('snacks','salads','entrees','sides','desserts','drinks','cocktails')),
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  photo_url TEXT,
  is_vegetarian INTEGER NOT NULL DEFAULT 0,
  is_vegan INTEGER NOT NULL DEFAULT 0,
  is_gluten_free INTEGER NOT NULL DEFAULT 0,
  contains_nuts INTEGER NOT NULL DEFAULT 0,
  customization_options TEXT NOT NULL DEFAULT '[]',
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_menu_items_course
  ON menu_items (course, sort_order);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup','delivery')),
  delivery_address TEXT,
  items TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  tip_cents INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL CHECK (status IN
    ('received','preparing','ready','completed')),
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, created_at);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 12),
  reserved_date TEXT NOT NULL,
  reserved_time TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN
    ('confirmed','seated','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_date
  ON reservations (reserved_date, reserved_time);
`;

declare global {
  // eslint-disable-next-line no-var
  var __harborDb: Database.Database | undefined;
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/**
 * Shared connection. Cached on globalThis so Next.js dev-mode hot reload
 * does not pile up file handles.
 */
export function getDb(): Database.Database {
  if (!globalThis.__harborDb) {
    globalThis.__harborDb = open();
  }
  return globalThis.__harborDb;
}

export { DB_PATH };
