import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { withTenant, __getPoolForTests, closePool, TenantScopeError } from "@/lib/pg";
import { refuseIfNotOurDatabase } from "@/lib/scratch-db-guard";

/**
 * Does per-tenant isolation actually hold for Harbor Bistro, and does the
 * per-VISITOR scoping still hold inside a tenant?
 *
 * TWO DIMENSIONS, TWO LAYERS, AND THEY ARE NOT THE SAME THING.
 *   tenant_id  -> which restaurant. Enforced by Postgres RLS.
 *   visitor_id -> which browser created the row (D-016). Enforced by the
 *                 WHERE clause (scopeSql), because a visitor is not a
 *                 principal the database knows about and there are no
 *                 per-visitor roles.
 * Collapsing them would be a real bug, so this file tests them separately and
 * says which layer each assertion is about.
 *
 * THE CONTROL IS THE POINT. "Tenant A cannot see tenant B's rows" is satisfied
 * just as well by an empty table or a setup that never ran, so the first tests
 * prove the rows EXIST and ARE READABLE when correctly scoped.
 *
 * TWO ROLES. DATABASE_URL is the ADMIN connection (a superuser locally) and is
 * used only to build the schema and read the catalog. Everything asserting
 * isolation runs as harbor_app, because RLS DOES NOT APPLY TO A SUPERUSER --
 * not with ENABLE, not with FORCE. Measured on demo-axlepoint: connecting as
 * the superuser left every policy inert while the schema read as correct.
 */

const A = "sample";
const B = "paying-customer";
const VISITOR_A = "visitor-aaaa";
const VISITOR_B = "visitor-bbbb";
const SEED_VISITOR = "seed";

let admin: Pool;
let adminUrl: string;

function appUrlFrom(url: string): string {
  const u = new globalThis.URL(url);
  u.username = "harbor_app";
  u.password = "harbor_app";
  return u.toString();
}

function requireScratchDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. This test DROPS AND RECREATES schemas, so it " +
        "refuses to guess. Run `npm run db:dev` for a verified one.",
    );
  }
  for (const smell of ["neon.tech", "prod", "portal"]) {
    if (url.toLowerCase().includes(smell)) {
      throw new Error(`DATABASE_URL contains "${smell}". Refusing: this drops schemas.`);
    }
  }
  return url;
}

async function insertOrder(
  tenant: string,
  id: string,
  visitor: string | null,
  name: string,
): Promise<void> {
  await admin.query(
    `INSERT INTO orders (tenant_id, id, customer_name, customer_phone, fulfillment,
                         items, subtotal_cents, total_cents, status, visitor_id)
     VALUES ($1, $2, $3, '555-0100', 'pickup', '[]', 100, 100, 'received', $4)`,
    [tenant, id, name, visitor],
  );
}

beforeAll(async () => {
  adminUrl = requireScratchDatabase();
  admin = new Pool({ connectionString: adminUrl });
  await refuseIfNotOurDatabase((sql) => admin.query(sql));
  await admin.query(fs.readFileSync(path.join(process.cwd(), "db", "reset-schemas.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  await admin.query("ALTER ROLE harbor_app PASSWORD 'harbor_app'");
  process.env.DATABASE_URL = appUrlFrom(adminUrl);
});

afterAll(async () => {
  await closePool();
  if (admin) await admin.end();
  // Restore the admin URL: process env is shared by every file in the run, and
  // leaving it rewritten makes the suite's result depend on file order.
  if (adminUrl) process.env.DATABASE_URL = adminUrl;
});

beforeEach(async () => {
  await admin.query("DELETE FROM orders");
  await admin.query("DELETE FROM reservations");
  await insertOrder(A, "AAA11", VISITOR_A, "Visitor A order");
  await insertOrder(A, "BBB22", VISITOR_B, "VISITOR-B-SECRET-NAME");
  await insertOrder(A, "SEED01", SEED_VISITOR, "Seeded demo order");
  await insertOrder(B, "CCC33", VISITOR_A, "PAYING CUSTOMER ORDER");
});

describe("the role the app connects as can be constrained", () => {
  it("is neither a superuser nor BYPASSRLS", async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'harbor_app'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });

  it("does not own the tables, so it cannot disable the policies", async () => {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text n FROM pg_tables
        WHERE schemaname = 'public' AND tableowner = 'harbor_app'`,
    );
    expect(rows[0].n).toBe("0");
  });
});

describe("the control: a leak would be visible if there were one", () => {
  it("the sample tenant reads its own three orders", async () => {
    const rows = await withTenant(A, (db) => db.query<{ id: string }>("SELECT id FROM orders"));
    expect(rows.map((r) => r.id).sort()).toEqual(["AAA11", "BBB22", "SEED01"]);
  });

  it("and the other tenant reads its one, so both really exist", async () => {
    const rows = await withTenant(B, (db) => db.query<{ id: string }>("SELECT id FROM orders"));
    expect(rows.map((r) => r.id)).toEqual(["CCC33"]);
  });
});

describe("LAYER 1 -- cross-tenant isolation, enforced by RLS", () => {
  it("an UNFILTERED select returns only this tenant", async () => {
    const rows = await withTenant(A, (db) =>
      db.query<{ tenant_id: string }>("SELECT tenant_id FROM orders"),
    );
    expect(rows.every((r) => r.tenant_id === A)).toBe(true);
  });

  it("cannot reach another tenant's order by naming its id", async () => {
    const rows = await withTenant(A, (db) =>
      db.query("SELECT id FROM orders WHERE id = $1", ["CCC33"]),
    );
    expect(rows).toHaveLength(0);
  });

  it("cannot UPDATE another tenant's order", async () => {
    await withTenant(A, (db) =>
      db.query("UPDATE orders SET customer_name = 'hijacked' WHERE id = $1", ["CCC33"]),
    );
    const { rows } = await admin.query<{ customer_name: string }>(
      "SELECT customer_name FROM orders WHERE tenant_id = $1 AND id = 'CCC33'",
      [B],
    );
    expect(rows[0].customer_name).toBe("PAYING CUSTOMER ORDER");
  });

  it("cannot INSERT a row tagged with another tenant", async () => {
    await expect(
      withTenant(A, (db) =>
        db.query(
          `INSERT INTO orders (tenant_id, id, customer_name, customer_phone, fulfillment,
                               items, subtotal_cents, total_cents, status)
           VALUES ($1, 'PLANT', 'planted', '555', 'pickup', '[]', 1, 1, 'received')`,
          [B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("returns nothing outside withTenant, because app.tenant_id is unset", async () => {
    const { rows } = await __getPoolForTests().query("SELECT id FROM orders");
    expect(rows).toHaveLength(0);
  });
});

/**
 * LAYER 2. This is the harbor-specific leak the enumerable 5-symbol order code
 * would otherwise make possible: 31^5 is about 28.6 million, which is
 * guessable at scale, so "knowing a valid code" must NOT be enough to read the
 * record.
 *
 * It is enforced by the WHERE clause, NOT by RLS -- every assertion here would
 * pass against a database with no policies at all. That is exactly why it has
 * its own section: proving tenant isolation says nothing about visitor
 * isolation, and the two are easy to conflate because both are "scoping".
 */
describe("LAYER 2 -- per-visitor isolation inside one tenant, enforced by scopeSql", () => {
  /**
   * scopeSql's shape, kept here literally so this test fails if it changes.
   *
   * It APPENDS to a caller-owned params array and numbers the placeholders from
   * the resulting positions. The first version hardcoded $2 and $3, which was
   * correct at exactly one of the five call sites below and produced "could not
   * determine data type of parameter $1" at the others. Hand-numbered
   * placeholders are right until someone adds a clause -- the same mistake
   * demo-axlepoint's getAssets already had to fix with a bind() helper.
   */
  const scoped = (visitor: string, params: unknown[]): string => {
    const bind = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };
    return `(visitor_id = ${bind(SEED_VISITOR)} OR visitor_id = ${bind(visitor)})`;
  };

  it("visitor A cannot read visitor B's order EVEN WITH A VALID CODE", async () => {
    const params: unknown[] = ["BBB22"];
    const where = scoped(VISITOR_A, params);
    const rows = await withTenant(A, (db) =>
      db.query(`SELECT id, customer_name FROM orders WHERE id = $1 AND ${where}`, params),
    );
    expect(rows).toHaveLength(0);
  });

  it("and the secret name never appears in what visitor A can read", async () => {
    const params: unknown[] = [];
    const where = scoped(VISITOR_A, params);
    const rows = await withTenant(A, (db) =>
      db.query<{ customer_name: string }>(`SELECT customer_name FROM orders WHERE ${where}`, params),
    );
    expect(JSON.stringify(rows)).not.toContain("VISITOR-B-SECRET-NAME");
  });

  it("but SEED rows stay shared, which is the point of the demo", async () => {
    // A naive "visitor A can read nothing but its own" test would fail here and
    // look like a leak. Seeded rows are deliberately visible to everyone.
    const params: unknown[] = [];
    const where = scoped(VISITOR_A, params);
    const rows = await withTenant(A, (db) =>
      db.query<{ id: string }>(`SELECT id FROM orders WHERE ${where}`, params),
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["AAA11", "SEED01"]);
  });

  it("visitor B sees its own row and the seed, not visitor A's", async () => {
    const params: unknown[] = [];
    const where = scoped(VISITOR_B, params);
    const rows = await withTenant(A, (db) =>
      db.query<{ id: string }>(`SELECT id FROM orders WHERE ${where}`, params),
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["BBB22", "SEED01"]);
  });

  it("the two dimensions are independent: a visitor id from another tenant reads nothing", async () => {
    // VISITOR_A also created an order in tenant B. Scoping to tenant B with
    // visitor A must not return tenant A's rows, and vice versa.
    const params: unknown[] = [];
    const where = scoped(VISITOR_A, params);
    const rows = await withTenant(B, (db) =>
      db.query<{ id: string }>(`SELECT id FROM orders WHERE ${where}`, params),
    );
    expect(rows.map((r) => r.id)).toEqual(["CCC33"]);
  });
});

describe("withTenant refuses a tenant id it cannot trust", () => {
  for (const bad of ["", "   ", "'; DROP TABLE orders; --", "a".repeat(65)]) {
    it(`rejects ${JSON.stringify(bad)}`, async () => {
      await expect(withTenant(bad, async () => "unreachable")).rejects.toBeInstanceOf(
        TenantScopeError,
      );
    });
  }
});

describe("RLS coverage is total", () => {
  it("every table has RLS enabled AND forced", async () => {
    const { rows } = await admin.query<{
      tablename: string;
      rowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      // Namespace-qualified: pristine.* share names with public.*, and a join
      // on relname alone matches the copies, which correctly have no RLS.
      `SELECT t.tablename, t.rowsecurity, c.relforcerowsecurity
         FROM pg_tables t
         JOIN pg_namespace n ON n.nspname = t.schemaname
         JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = n.oid
        WHERE t.schemaname = 'public' ORDER BY t.tablename`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.filter((r) => !r.rowsecurity || !r.relforcerowsecurity).map((r) => r.tablename),
    ).toEqual([]);
  });

  it("every table has a tenant_isolation policy and a tenant_id column", async () => {
    const { rows: tables } = await admin.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const { rows: pol } = await admin.query<{ tablename: string }>(
      "SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation'",
    );
    const { rows: cols } = await admin.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name='tenant_id'`,
    );
    const names = tables.map((t) => t.tablename);
    expect(names.filter((t) => !new Set(pol.map((r) => r.tablename)).has(t))).toEqual([]);
    expect(names.filter((t) => !new Set(cols.map((r) => r.table_name)).has(t))).toEqual([]);
  });

  it("every PRIMARY KEY and UNIQUE includes tenant_id", async () => {
    // menu_items.slug was globally UNIQUE in the SQLite schema. Kept that way,
    // a SECOND restaurant could never have a "fish-tacos" slug -- a tenancy bug
    // invisible until a second tenant exists (demo-axlepoint #46).
    const { rows } = await admin.query<{ conname: string; def: string; tablename: string }>(
      `SELECT c.conname, pg_get_constraintdef(c.oid) AS def, t.relname AS tablename
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public' AND c.contype IN ('p','u')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const columnsOf = (def: string): string[] => {
      const open = def.indexOf("(");
      const close = def.indexOf(")", open);
      if (open < 0 || close < 0) return [];
      return def.slice(open + 1, close).split(",").map((c) => c.trim());
    };
    expect(
      rows
        .filter((r) => !columnsOf(r.def).includes("tenant_id"))
        .map((r) => `${r.tablename}.${r.conname}: ${r.def}`),
    ).toEqual([]);
  });

  it("every table has exactly one PERMISSIVE policy, covering ALL commands", async () => {
    // Permissive policies are OR-ed, so a second one WIDENS a table. Restrictive
    // ones are AND-ed and can only narrow, so they are excluded here.
    const { rows } = await admin.query<{ tablename: string; n: string; cmds: string }>(
      `SELECT tablename, count(*)::text n, string_agg(DISTINCT cmd, ',') cmds
         FROM pg_policies WHERE schemaname='public' AND permissive='PERMISSIVE'
        GROUP BY tablename`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.n !== "1").map((r) => r.tablename)).toEqual([]);
    expect(rows.filter((r) => r.cmds !== "ALL").map((r) => r.tablename)).toEqual([]);
  });

  it("no views, matviews, foreign tables or sequences in public", async () => {
    const { rows } = await admin.query<{ relname: string; relkind: string }>(
      `SELECT c.relname, c.relkind::text relkind
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('v','m','f','S')`,
    );
    expect(rows.map((r) => `${r.relname} (${r.relkind})`)).toEqual([]);
  });

  it("every foreign key includes tenant_id", async () => {
    // None today. This exists so adding one on (id) alone -- which would let a
    // row reference another tenant's row -- fails here rather than in review.
    const { rows } = await admin.query<{ conname: string; def: string }>(
      `SELECT c.conname, pg_get_constraintdef(c.oid) def
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname='public' AND c.contype='f'`,
    );
    expect(rows.filter((r) => !r.def.includes("tenant_id")).map((r) => r.conname)).toEqual([]);
  });
});
