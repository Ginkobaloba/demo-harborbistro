-- Harbor Bistro on Postgres: schema with per-tenant row isolation.
--
-- Ported from the SQLite DDL in src/lib/db.ts. The pattern is AxlePoint's
-- (demo-axlepoint D-022..D-027), reused deliberately rather than rederived.
-- What is DIFFERENT here is worth reading before changing anything:
--
-- 1. TENANCY IS TWO-DIMENSIONAL. Harbor already scopes rows by `visitor_id`
--    (D-016): which browser created this order. `tenant_id` is a SECOND and
--    ORTHOGONAL dimension: which restaurant it belongs to. They must not be
--    collapsed. RLS enforces the tenant; the visitor stays in the WHERE clause
--    (src/lib/visitor.ts scopeSql), because a visitor is not a security
--    principal the database knows about and there are no per-visitor roles.
--
-- 2. menu_items.slug WAS GLOBALLY UNIQUE, and that would have made a second
--    tenant impossible: two restaurants cannot both have a "fish-tacos" slug.
--    It is now UNIQUE (tenant_id, slug). This is the shape that made
--    demo-axlepoint #46 add an assertion for it -- a global unique is a
--    tenancy bug invisible until a second tenant exists.
--
-- 3. THE created_at DEFAULT IS A DIALECT TRAP. SQLite used
--    `DEFAULT (datetime('now'))`, which produces `2026-09-25 11:30:00` and is
--    parsed as that shape by the app. Postgres has no datetime(); dropping the
--    default would silently leave rows with whatever the caller passed, and a
--    `now()` default would store a DIFFERENT FORMAT that the app then
--    misreads. The to_char below reproduces the exact string SQLite wrote.

CREATE TABLE menu_items (
  tenant_id             text NOT NULL CHECK (tenant_id <> ''),
  -- integer, and deliberately NOT an identity column. Menu items come from the
  -- seed with explicit ids, and orders.items references them by number inside
  -- a JSON payload. An identity column would also add a shared sequence, whose
  -- last_value leaks cross-tenant row volume (axlepoint D-023).
  id                    integer NOT NULL,
  slug                  text NOT NULL,
  name                  text NOT NULL,
  course                text NOT NULL CHECK (course IN
                          ('snacks','salads','entrees','sides','desserts','drinks','cocktails')),
  description           text NOT NULL,
  price_cents           integer NOT NULL CHECK (price_cents > 0),
  photo_url             text,
  is_vegetarian         integer NOT NULL DEFAULT 0,
  is_vegan              integer NOT NULL DEFAULT 0,
  is_gluten_free        integer NOT NULL DEFAULT 0,
  contains_nuts         integer NOT NULL DEFAULT 0,
  customization_options text NOT NULL DEFAULT '[]',
  is_featured           integer NOT NULL DEFAULT 0,
  sort_order            integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_menu_items_course ON menu_items (tenant_id, course, sort_order);

CREATE TABLE orders (
  tenant_id                  text NOT NULL CHECK (tenant_id <> ''),
  id                         text NOT NULL,
  customer_name              text NOT NULL,
  customer_phone             text NOT NULL,
  customer_email             text,
  fulfillment                text NOT NULL CHECK (fulfillment IN ('pickup','delivery')),
  delivery_address           text,
  items                      text NOT NULL,
  subtotal_cents             integer NOT NULL CHECK (subtotal_cents >= 0),
  tip_cents                  integer NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  total_cents                integer NOT NULL CHECK (total_cents >= 0),
  status                     text NOT NULL CHECK (status IN
                               ('pending','received','preparing','ready','completed','cancelled')),
  stripe_payment_intent_id   text,
  stripe_checkout_session_id text,
  -- The visitor dimension. NOT a tenant, and not a security principal: it is
  -- which browser created the row, filtered in the WHERE clause by scopeSql.
  visitor_id                 text,
  created_at                 text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at                 text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX idx_orders_status  ON orders (tenant_id, status, created_at);
CREATE INDEX idx_orders_visitor ON orders (tenant_id, visitor_id, created_at);

CREATE TABLE reservations (
  tenant_id     text NOT NULL CHECK (tenant_id <> ''),
  id            text NOT NULL,
  name          text NOT NULL,
  phone         text NOT NULL,
  email         text,
  party_size    integer NOT NULL CHECK (party_size BETWEEN 1 AND 12),
  reserved_date text NOT NULL,
  reserved_time text NOT NULL,
  notes         text,
  status        text NOT NULL DEFAULT 'confirmed' CHECK (status IN
                  ('confirmed','seated','completed','cancelled')),
  visitor_id    text,
  created_at    text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX idx_reservations_date    ON reservations (tenant_id, reserved_date, reserved_time);
CREATE INDEX idx_reservations_visitor ON reservations (tenant_id, visitor_id, created_at);

-- ---------------------------------------------------------------------------
-- No views, materialized views or foreign tables. The RLS loop below walks
-- pg_tables, which lists ORDINARY TABLES ONLY: a view is relkind 'v', never
-- appears there, would receive no policy, and would hand back every tenant's
-- rows through a relation the coverage tests cannot see. Matviews cannot carry
-- RLS at all. Measured on axlepoint 2026-09-25: creating a view left all three
-- coverage tests green. So this fails the apply rather than trusting anyone to
-- remember.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(c.relname || ' (' || c.relkind::text || ')', ', ')
    INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm', 'f');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'public contains relations RLS cannot cover: %. Views/matviews/foreign tables bypass the pg_tables walk.', bad;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Row level security on EVERY table, applied from the catalog.
--
-- FORCE is not optional: Postgres does not apply a policy to a table's OWNER
-- without it, and the role an app connects as is usually the owner of what it
-- created. RLS ALSO DOES NOT APPLY TO A SUPERUSER AT ALL -- not with ENABLE,
-- not with FORCE -- which is why the app connects as harbor_app below.
--
-- current_setting(..., true) is NULL when unset, so the comparison is NULL and
-- no rows match: unset means see nothing.
--
-- WITH CHECK is stated explicitly and is deliberately redundant: when it is
-- omitted Postgres uses the USING expression for new rows anyway. It is kept
-- because the read rule and the write rule being identical is a CHOICE, and
-- spelling it out means a future edit to USING cannot silently change what a
-- tenant may write. Do not read it as the thing preventing cross-tenant
-- INSERTs; USING already does that.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
    $f$, t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Roles. Attributes are re-asserted with an UNCONDITIONAL ALTER, because roles
-- are CLUSTER-level: DROP SCHEMA never removes them, so a guarded CREATE runs
-- once in the life of a database and attributes written there stop being
-- enforced forever after. The ALTER is also CONDITIONAL on something actually
-- being wrong, because Postgres requires the altering role to HOLD each
-- attribute it changes -- even when setting the value it already has -- and
-- Neon's admin is not a superuser.
--
-- No passwords here. A credential in a committed schema file is a credential
-- in every clone and every CI log.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'harbor_app') THEN
    CREATE ROLE harbor_app LOGIN;
  END IF;
  SELECT rolsuper, rolbypassrls, rolreplication, rolcreatedb, rolcreaterole
    INTO r FROM pg_roles WHERE rolname = 'harbor_app';
  IF r.rolsuper OR r.rolbypassrls OR r.rolreplication OR r.rolcreatedb OR r.rolcreaterole THEN
    BEGIN
      ALTER ROLE harbor_app NOSUPERUSER NOBYPASSRLS NOREPLICATION NOCREATEDB NOCREATEROLE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION
        'harbor_app holds privileges that defeat RLS (super=% bypassrls=% repl=%), and this role cannot remove them. Provision it without them, out of band, then re-apply.',
        r.rolsuper, r.rolbypassrls, r.rolreplication;
    END;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO harbor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO harbor_app;

-- ---------------------------------------------------------------------------
-- The pristine dataset and the confined reset role. Same design as axlepoint
-- D-026: pristine is NOT a tenant, so restoring it is not a cross-tenant read,
-- so the reset needs neither BYPASSRLS nor a SECURITY DEFINER function.
-- ---------------------------------------------------------------------------
CREATE SCHEMA pristine;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    -- LIKE ... INCLUDING DEFAULTS, not "AS SELECT ... WITH NO DATA": the
    -- latter copies types and nothing else, so DEFAULT expressions are lost
    -- and every restored created_at would be NULL against a NOT NULL column.
    EXECUTE format('CREATE TABLE pristine.%I (LIKE public.%I INCLUDING DEFAULTS)', t, t);
    EXECUTE format('ALTER TABLE pristine.%I DROP COLUMN tenant_id', t);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'harbor_reset') THEN
    CREATE ROLE harbor_reset LOGIN;
  END IF;
END
$$;
ALTER ROLE harbor_reset NOSUPERUSER NOBYPASSRLS NOREPLICATION NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA pristine TO harbor_reset;
GRANT SELECT ON ALL TABLES IN SCHEMA pristine TO harbor_reset;
GRANT USAGE ON SCHEMA public TO harbor_reset;
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO harbor_reset;

-- The app must not read the pristine dataset. It has no reason to, and the
-- reset's safety argument is that pristine is reachable only by a role that
-- cannot leave the sample tenant.
REVOKE ALL ON SCHEMA pristine FROM harbor_app;

-- A RESTRICTIVE policy is what actually confines the reset role. The obvious
-- version confines nothing: app.tenant_id is set BY the connecting role, so a
-- reset role that can set it can name a paying customer and RLS scopes to that
-- instead (measured on axlepoint). RESTRICTIVE policies are AND-ed rather than
-- OR-ed, so this pins harbor_reset to the sample tenant regardless of the GUC.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format($f$
      CREATE POLICY reset_sample_only ON %I AS RESTRICTIVE TO harbor_reset
        USING      (tenant_id = 'sample')
        WITH CHECK (tenant_id = 'sample')
    $f$, t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- The reset log, in `ops` rather than `public`, because the reset would erase
-- it otherwise: every public table is restored from pristine, so a timestamp
-- written into one would be deleted by the thing it audits. Failures are
-- logged too, or "no recent success" cannot tell "never ran" from "ran and
-- failed".
-- ---------------------------------------------------------------------------
CREATE SCHEMA ops;

CREATE TABLE ops.reset_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     text NOT NULL,
  started_at    timestamptz NOT NULL,
  finished_at   timestamptz NOT NULL DEFAULT now(),
  ok            boolean NOT NULL,
  rows_restored integer NOT NULL DEFAULT 0,
  error         text
);
CREATE INDEX idx_reset_log_recent ON ops.reset_log (tenant_id, finished_at DESC);

GRANT USAGE ON SCHEMA ops TO harbor_reset;
GRANT SELECT, INSERT ON ops.reset_log TO harbor_reset;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ops TO harbor_reset;

-- The app reads freshness but must never write it: a process that can forge a
-- reset record can hide a reset that never happened.
GRANT USAGE ON SCHEMA ops TO harbor_app;
GRANT SELECT ON ops.reset_log TO harbor_app;
