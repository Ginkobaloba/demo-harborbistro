# 2026-09-25 07:13 CDT - Postgres schema and tenant isolation, with visitor scoping as a second layer
- **Who:** Claude (Opus 5), harborbistro port step 1, plan approved by the Orchestrator.
- **Change:** `db/schema.sql` (3 tables, composite PKs, RLS forced, harbor_app
  and harbor_reset roles, pristine + ops schemas, restrictive reset policy);
  `db/reset-schemas.sql`; `src/lib/pg.ts` and `tenant.ts` adapted from
  demo-axlepoint; `src/lib/pg.rls.itest.ts` (24 tests); CI Postgres service.
  D-024. No query ported, nothing wired into the app.
- **Why:** Reuse the proven pattern rather than rederive it. Harbor was chosen
  over slatewell on measurement: slatewell holds MORE visitor text, harbor
  protects it far less well (a 31^5 enumerable code vs a real token, an env-flag
  admin gate vs session auth, one nginx rule as the live control).
- **State after:** tsc 0, lint 0 errors, unit 242 passed (unchanged and still
  database-free), isolation 24 passed, `npm run build` compiles with no
  database. Mutations red: tenant policy allowing everything (8), FORCE removed
  (1), menu slug back to a global UNIQUE (1), the visitor filter dropped (4).
- **A mutation that came back GREEN and was NOT a gap:** granting BYPASSRLS in
  the schema text. Harbor's ALTER ROLE is CONDITIONAL -- it fires only when an
  attribute is actually wrong -- so with the role already clean the mutation
  never executed. Tested the real condition instead by granting BYPASSRLS out of
  band: the suite still passed, because `beforeAll` re-applies the schema and
  the conditional ALTER REPAIRS the role before any assertion runs. That is
  correct for a deploy and means the suite cannot detect post-deploy drift. A
  standalone role check, like check:reset, is the right shape for that; noted,
  not built.
- **THE NEAR-MISS WORTH READING:** a docker port binding silently failed and
  `localhost:55434` belonged to ANOTHER SESSION's scratch database
  (automation-engine-dev-pg). The test connected to it over TCP and was refused
  only because the password differed. Had it matched, `beforeAll` would have
  run DROP SCHEMA public CASCADE on their data. The guard checked the URL for
  "prod"/"neon"/"portal" -- a SMELL, not an IDENTITY -- and "another
  developer's scratch database" passes that perfectly. The suite now refuses to
  drop anything in a database whose public schema holds tables it does not own.
- **Also:** `db:reset` and `check:reset` were deliberately NOT added to
  package.json yet. `check:reset` is what makes the cloudflare-config deploy
  gate mandatory, and adding it before the script exists would fail every
  deploy on a missing file.
- **Refs:** D-024, `C:\dev\DEMOS_POSTGRES_PORT_PLAN.md`, demo-axlepoint
  D-022..D-027 and #46/#47.
