# Deep Verify: PR #28 visitor-scoped admin, Stripe test-key guard, visitor data expiry (2026-09-19)

Overall: PASS
Tested-SHA: 2c0ff4caeeb23896860623e56a3f01b632222ccb

Every claim the PR makes about visitor scoping, the Stripe test-key guard and
visitor data expiry held under an independent harness: 220 of 220 checks
passed, plus 7 N/A (HSTS is edge-only) and 2 SKIP (axe). The repo's own
assertions passed 62 of 62 inside that total. Nothing in this run reached the
Stripe API. The coverage gaps at the end list what this PASS does not show.

**Process note, read first:** PR #28 was squash-merged at 2026-09-19T06:44:59Z
while this run was in progress. Its CI "Deep Verify" job was green before any
deep-verify report for #28 existed, because `verify/ci/deep_gate.sh` accepts a
PASS in *any* report under `verify/reports/` and the #25 report already says
PASS (see Warnings). The code under test is still the code on `main`: see
"Target and scope".

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-harborbistro` PR #28, branch
  `fix/visitor-scoped-admin` (deleted on merge), head
  `2c0ff4caeeb23896860623e56a3f01b632222ccb`.
- **Merge:** squash commit `9992646a7be7b1e46b4edbb555aa22b33208bb1c` on
  `main`, parent `c631da4`. **The tree of `main` at `9992646` is identical to
  the tree of the verified head `2c0ff4c`** (both
  `c85b0931f8fd4f071fd04f3e0584f14c8a54ed87`; `git diff --quiet 2c0ff4c
  origin/main` exits 0). So this report verifies exactly what is on `main`.
- **Tier:** Tier-3 (auth scope plus payment). The PR carries the `tier-3`
  label; `verify/tier_map.yml` marks `reservations` and `order-checkout` as
  tier 3. Drew approved this run.
- **Mode:** deep (`paradigm-verify`): layers 1, 2, 3, 4 and 6 plus a curated
  edge sweep. **Layer 5 (headed Chrome) was not run** because sibling runs
  were using the browser; it is listed as a coverage gap. The adversarial
  generator was not run.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human.
- **Environment:** one image, `demo-harborbistro:dv28`, built locally from the
  PR head with `docker build --secret id=npmrc,...` (the build secret was a
  temp file in the scratch dir, deleted right after the build). The image's
  own build ran `npm run db:seed` ("20 orders, 15 reservations") and
  `npm run db:verify` ("Seed verification passed"). Eight throwaway
  containers ran from it on the runtime env file
  `C:\Users\Drama\.secrets\demo_env_harborbistro.local.txt` with per-container
  overrides:

  | Container | Port | STRIPE_SECRET_KEY | Publishable key | Purpose |
  |---|---|---|---|---|
  | dv28-none | 127.0.0.1:18401 | empty | empty | scope matrix, edge sweep, headless, repo assertions |
  | dv28-test | 127.0.0.1:18402 | fake `sk_test_` | empty | guard passes, Stripe attempted and blocked; reconcile ordering |
  | dv28-live | 127.0.0.1:18403 | fake `sk_live_` | empty | refused |
  | dv28-rk | 127.0.0.1:18404 | fake `rk_test_` | empty | refused |
  | dv28-rklive | 127.0.0.1:18405 | fake `rk_live_` | empty | refused |
  | dv28-pklive | 127.0.0.1:18406 | fake `sk_test_` | fake `pk_live_` | refused |
  | dv28-ret | 127.0.0.1:18407 | empty | empty | retention with backdated rows, then `docker restart` |
  | dv28-legacy | 127.0.0.1:18408 | empty | empty | DB rebuilt WITHOUT `visitor_id` before boot, to exercise the in-place migration |

- **No Stripe API calls, enforced and measured:**
  - Every container ran with `--add-host api.stripe.com:127.0.0.1`. A probe in
    each container resolved `api.stripe.com -> 127.0.0.1`.
  - Every fake key was 32 characters of random text behind the named prefix.
    Probes confirmed the overrides by prefix and length only.
  - A small TCP listener on `127.0.0.1:443` inside each container logged every
    connection attempt and closed it (sanity-checked: one probe connection
    produced exactly one line). This turns "did the app try Stripe" into a
    number: 0 in every refused container, 3 on one checkout in `dv28-test`.
- No key value was printed at any point; only prefixes, lengths and counts.
- The live `demo-harborbistro` container, the public URL, the demo-proxy and
  `C:\dev\cloudflare-config` were not touched. The only action against the
  live container was a read-only `docker inspect` of its mounts, which
  returned `[]` (see Warnings, deploy note). Its database was not read.
- Evidence dir (not in the repo):
  `C:\Users\Drama\AppData\Local\Temp\claude\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\scratchpad\dv28\`
  (`harness.mjs`, `setup.ps1`, `run3.log`, `build.log`, `vitest.log`,
  `purge.log`). `run3.log` is the clean run below; runs 1 and 2 hit harness
  bugs, explained under "Harness corrections".

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| auth_lifecycle (visitor scope) | PASS | P1 to P27 and X1 to X14 (42 attacker checks); H0 to H8 |
| data_crud | PASS | reservations via the real API and UI; orders inserted per visitor; admin transitions read back (P21, P23 to P25) |
| security (key exposure) | PASS | 0 `sk_`/`rk_` keys, 0 `pk_live_`, 0 exact key values in 10 pages + 17 JS chunks + 503 body, in all 6 key containers |
| payment guard | PASS | K section: 503 and 0 Stripe connections for no key, `sk_live_`, `rk_test_`, `rk_live_`, `pk_live_` |
| data retention | PASS | T1 to T6 (boot purge, both timestamp formats, 23h vs 25h), plus the on-demand script (Layer 1) |
| migration | PASS | M1 to M8 on a pre-tagging DB |
| error_handling | PASS | 400/404/405/409/503 paths (E1 to E23, K-*-3, K-test-5) |
| edge_cases | PASS | 23 of 23 (E1 to E23) |
| smoke | PASS | repo assertions Q1 to Q73: 62 PASS, 7 N/A, 2 SKIP |
| navigation | PASS | headless menu, cart, order, reservations, confirmation, admin |
| performance | PASS (local) | home LCP 72 ms at the local origin, not an edge or mobile-network number |
| mobile_responsive | PASS (partial) | every headless check ran at 390x844 |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge (7 assertions) |
| accessibility | SKIP | `axe_no_critical` (2): axe-core is not in the harness |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | Chromium only; headed Chrome not run |

### Layer 1: code (at `2c0ff4c`)

- `npx vitest run`: 13 files, **92 passed / 92**.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 errors, 3 warnings (pre-existing files, as the PR says).
- `next build`: clean inside the Docker build (the `Middleware` route is in
  the build output).
- `npm run db:seed` then `npm run db:verify`: pass inside the Docker build.
- `git diff origin/main...2c0ff4c -- src/app/api/webhooks` is empty: the
  webhook route is unchanged, as claimed.
- Static scope audit (P27): every `FROM orders` / `FROM reservations` query
  in non-test source carries the `${sql}` scope predicate except exactly
  three: `getOrderUnscoped` (orders.ts:260, used only by Stripe reconcile and
  post-write bookkeeping), `getOrderByCheckoutSession` (orders.ts:280,
  webhook) and the per-slot count in `getAvailableSlots`
  (reservations.ts:42, returns times only). These match the PR's list.
- **On-demand purge script**, run on the host against a freshly seeded
  scratch DB (not any live DB) with four backdated orders: visitor -25h,
  visitor -23h, NULL -99h, seed -99h (`purge.log`):
  - `DRY_RUN=1`: "Would delete 1 orders", all 4 rows still present.
  - default: "Deleted 1 orders", the -25h visitor row gone; -23h, NULL and
    seed kept.
  - `INCLUDE_LEGACY=1`: "Deleted 1 orders ... (including legacy untagged
    rows)", the NULL row gone; seed and -23h kept. Seed total unchanged (21).

### Layer 2: runtime

- All 8 containers `running` with `RestartCount=0` at the end of the sweep,
  each serving `/` with 200 (R section). `dv28-ret` was restarted on purpose
  with `docker restart`, which does not count as a restart.
- The only error lines in any log were the expected ones: the `[startup]` and
  `[checkout]` refusals, and in `dv28-test` the `StripeConnectionError`
  ("Request was retried 2 times", `ECONNRESET`) from the blocked checkout and
  reconcile attempts.

### Layers 3 and 4: network and headless

- Repo assertions (`verify/smoke.yml`, `verify/assertions/home.yml`,
  `verify/assertions/reservations.yml`) ran against `dv28-none` over HTTP
  plus headless Chromium at 390x844: `{"PASS":62,"FAIL":0,"N/A":7,"SKIP":2}`
  (Q1 to Q73 in the log).
- Headless two-browser run (H section): two isolated Playwright contexts.
  Browser A booked a table through the real form and landed on
  `/reservations/HR-...`; browser B got 404 on that URL and did not see the
  booking in `/admin/reservations`, where the scope note was shown; A saw it.
  The demo notice was visible on `/reservations` and on the `/order` checkout
  form. A UI checkout submit with no key got 503 and showed the
  not-configured message without breaking the page.

### Layer 6: full check log (verbatim, clean run 3)

Section key: P and X are per-visitor scope and the attacker matrix, K is the
Stripe guard, M is migration, T is retention, E is the edge sweep, H is
headless Chromium, Q is the repo's own assertions, R is runtime. Visitor ids
are never printed; the Set-Cookie in P2 is shown with the id masked.

```
== P: per-visitor scope (container none, no Stripe key) ==
PASS  P1  A first request: 200 and hb_visitor Set-Cookie  [200]
PASS  P2  cookie flags: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure  [hb_visitor=<v4>; Path=/; Expires=Mon, 19 Oct 2026 06:58:03 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax]
PASS  P3  A id is a lowercase v4 UUID  [v4]
PASS  P4  A second request keeps its id (no new hb_visitor Set-Cookie)  [0 set-cookie]
PASS  P5  B gets its own distinct valid id  [distinct]
PASS  P6  A creates a reservation through the real API -> 201  [201 HR-B9AXQ]
PASS  P7  A reservation row is tagged with A visitor id  [tag==A]
PASS  P8  B creates its own reservation -> 201, tagged B  [201 HR-GC7QN]
PASS  P9  cookieless create -> 201, sets HttpOnly SameSite=Lax cookie, row tagged with that minted id  [201]
INFO  A order HB-A5739 (received), HB-C5739 (completed); B order HB-B5739; legacy HB-LGCYN / RS-LGCYN (visitor_id NULL); A res HR-B9AXQ; B res HR-GC7QN
INFO  unknown-id bodies: api={"error":"Order not found"} adminOrder={"error":"Order not found"} adminRes={"error":"Reservation not found"}
PASS  P10  A: own /reservations/<id> 200 with own name  [200]
PASS  P11  A: own /order/confirmation/<id> 200 showing the order (item line)  [200]
PASS  P12  A: own /api/orders/<id> 200, returns no PII fields  [id,status,statusLabel,fulfillment,updatedAt]
PASS  P13  A: /admin/orders lists A orders (active + recent) and seed  [A_ORD,A_ORD2,seed]
PASS  P14  A: /admin/reservations lists A booking and seed  []
PASS  P15  A: never sees B data (admin orders/reservations)  []
PASS  P16  A: B reservation detail 404  []
PASS  P17  A: legacy NULL rows hidden from A admin views  []
PASS  P18  A: legacy order /api/orders -> 404 and admin POST -> 404  []
PASS  P19  A: legacy reservation detail 404 and admin POST 404  []
PASS  P20  header counts are scoped: A active = B active (B has 1 own received order too), cookieless = seed-only = B - 1  [A=11 B=11]
PASS  X1a  B (own valid cookie): A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X1b  B (own valid cookie): /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X1c  B (own valid cookie): admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X2a  cookieless: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X2b  cookieless: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X2c  cookieless: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X3a  forged seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X3b  forged seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X3c  forged seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X4a  forged SEED: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X4b  forged SEED: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X4c  forged SEED: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X5a  forged url-encoded seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X5b  forged url-encoded seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X5c  forged url-encoded seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X6a  foreign random v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X6b  foreign random v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X6c  foreign random v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X7a  A id uppercased: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X7b  A id uppercased: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X7c  A id uppercased: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X8a  A id, version nibble 1: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X8b  A id, version nibble 1: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X8c  A id, version nibble 1: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X9a  A id with suffix: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X9b  A id with suffix: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X9c  A id with suffix: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X10a  dup: seed then foreign v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X10b  dup: seed then foreign v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X10c  dup: seed then foreign v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X11a  dup: foreign v4 then seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X11b  dup: foreign v4 then seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X11c  dup: foreign v4 then seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X12a  empty value: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X12b  empty value: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X12c  empty value: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X13a  4 KB junk: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X13b  4 KB junk: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X13c  4 KB junk: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X14a  SQL-shaped: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X14b  SQL-shaped: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X14c  SQL-shaped: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  P21  after the attack matrix A order is still received and A booking still confirmed, tags unchanged  [received/confirmed]
PASS  P22  B: 200 random guessed order codes, 0 non-seed foreign orders resolved  [foreign hits=0]
PASS  P23  A: admin POST advance on own order -> 200 preparing  [{"id":"HB-A5739","status":"preparing","statusLabel":"Preparing"}]
PASS  P24  A: admin POST seat own booking -> 200 seated  [{"id":"HR-B9AXQ","status":"seated"}]
PASS  P25  B: admin POST on a seed order -> 200 (staff demo still works)  [{"id":"HB-RUW7S","status":"preparing","statusLabel":"Preparing"}]
PASS  P26  every row written in this run is tagged: the only NULL rows are the 2 deliberate legacy inserts  [orders NULL=1 reservations NULL=1]
INFO  static: SELECT ... FROM orders|reservations without the scope predicate: src\lib\orders.ts:260, src\lib\orders.ts:280, src\lib\reservations.ts:42
PASS  P27  static: only 3 unscoped reads remain (getOrderUnscoped, getOrderByCheckoutSession, slot counts)  [src\lib\orders.ts:260 src\lib\orders.ts:280 src\lib\reservations.ts:42]

== K: Stripe test-key guard (per container) ==
PASS  K-none-1  none: valid checkout -> 503 "not configured"  [503 {"error":"Online payment is not configured in this environment. Set STRIPE_SECRET_KEY (test mode) to enable checkout."}]
PASS  K-none-2  none: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 24->24]
PASS  K-none-3  none: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-1  live: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-live-2  live: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-live-3  live: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rk-1  rk: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rk-2  rk: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rk-3  rk: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rklive-1  rklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rklive-2  rklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rklive-3  rklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-pklive-1  pklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-pklive-2  pklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-pklive-3  pklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-4  live: boot log carries the [startup] refusal  []
PASS  K-rk-4  rk: boot log carries the [startup] refusal  []
PASS  K-rklive-4  rklive: boot log carries the [startup] refusal  []
PASS  K-pklive-4  pklive: boot log carries the [startup] refusal  []
PASS  K-none-4  none: no [startup] refusal (missing key is not a live key), checkout says not configured  []
PASS  K-test-1  test (fake sk_test_): checkout passes the guard and DOES try Stripe (blocked at the pinned host)  [status 500, hits 0->3]
INFO  K-test checkout response: 500 
PASS  K-test-2  test: the pending order row is tagged with the caller visitor id  [HB-D5W54 pending]
PASS  K-test-3  test: B on A pending order with ?session_id -> 404 and 0 Stripe connections (scope check runs before reconcile)  [404 hits 3->3]
PASS  K-test-4  test: A on own pending order with ?session_id -> 200, reconcile attempted, fails soft (pending state shown)  [200 hits 3->6]
PASS  K-test-5  test: invalid checkout body -> 400 before any Stripe call  [400]
PASS  K-none-scan  none: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-test-scan  test: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-live-scan  live: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rk-scan  rk: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rklive-scan  rklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-pklive-scan  pklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]

== M: in-place migration of a pre-tagging database (container legacy) ==
PASS  M1  prep ran on a DB without visitor_id (boot log)  []
PASS  M2  server boot added visitor_id to orders and reservations  []
PASS  M3  ISO-timestamp seed rows backfilled to seed (20 orders, 15 reservations)  [20/15]
PASS  M4  app-style legacy rows kept with visitor_id NULL (2 orders, 2 reservations, incl. the 48h-old ones: not purged at boot)  [[{"id":"HB-LGCY2","v":null},{"id":"HB-LGCY3","v":null}][{"id":"RS-LGCY2","v":null},{"id":"RS-LGCY3","v":null}]]
PASS  M5  visitor indexes created  [2]
PASS  M6  fresh visitor: legacy names absent from admin views, seed shown  []
PASS  M7  legacy rows: detail, API and admin POST all 404 (fresh and forged-seed cookies)  [404/404/404/404/404]
PASS  M8  post-migration visitor write -> 201 and tagged  [201]

== T: 24h retention purge (container ret) ==
INFO  inserted per table: V25A (app format, -25h), V25B (ISO, -25h), V23 (-23h), S100 (seed, -100h), N100 (NULL, -100h); created_at V25A=2026-09-18 05:58:32 V25B=2026-09-18T05:58:32.863Z
PASS  T1  hourly gate: 6 requests after insert do not purge (boot run already happened this hour); all 5+5 rows present  [5/5]
PASS  T2  after restart (boot purge): orders -25h rows gone in both timestamp formats; -23h, seed -100h, NULL -100h kept  [N100,S100,V23]
PASS  T3  after restart: reservations same outcome  [N100,S100,V23]
PASS  T4  fresh visitor booking made minutes ago survives  [HR-PPS62]
PASS  T5  boot log: "[retention] deleted 2 orders and 2 reservations"  [[retention] deleted 2 orders and 2 reservations created by visitors before 2026-09-18T06:58:34.613Z]
PASS  T6  seed rows untouched (20 + 1 orders, 15 + 1 reservations incl. the -100h seed probes)  [21/16]

== E: edge sweep (container none) ==
PASS  E1  reservations: no body -> 400  [400 {"error":"Invalid JSON"}]
PASS  E2  reservations: garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E3  reservations: missing fields -> 400  [400 {"error":"name, phone, partySize, date, and time are required"}]
PASS  E4  reservations: partySize as string -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E5  reservations: partySize 13 -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E6  reservations: bad date format -> 400  [400 {"error":"date must be YYYY-MM-DD"}]
PASS  E7  reservations: closed Monday -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E8  reservations: time not a slot (03:00) -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E9  reservations: 1 MB name -> handled, no 500/crash  [201 {"id":"HR-RDFMJ"}]
INFO  E9 1 MB name status 201 (201 means stored, no size cap)
PASS  E10  reservations: HTML/unicode/apostrophes in name -> 201  [201 {"id":"HR-65TNS"}]
PASS  E11  owner confirmation and admin escape HTML (no raw <script>alert(1) or <img src=x), unicode intact  []
PASS  E12  20 concurrent same-slot bookings: 201 count = remaining capacity (6 - existing), rest 409, slot never over 6  [existing 0, 201 x6, 409 x14, now 6]
PASS  E13  20 concurrent cookieless first requests -> 20 distinct valid v4 ids  [20]
PASS  E14  admin orders POST garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E15  admin orders POST unknown action -> 400  [400 {"error":"action must be \"advance\" or \"cancel\""}]
PASS  E16  admin reservations POST status "confirmed" (not allowed) -> 400  [400 {"error":"status must be one of seated, completed, cancelled"}]
PASS  E17  admin orders GET -> 405  [405]
PASS  E18  SQL-shaped ids on /api/orders and admin POST -> 404  [404/404]
PASS  E19  matcher-skipped path /api/orders/<A>.png -> 404 for B and cookieless  [404/404]
PASS  E20  unicode reservation id -> 404, not 500  [404]
PASS  E21  owner illegal transition completed -> cancelled -> 409 (not 404, not 500)  [409 {"error":"Reservation HR-B9AXQ cannot move from \"completed\" to \"cancelled\""}]
PASS  E22  checkout 1 MB body with no key -> 503, no crash  [503]
PASS  E23  4 KB cookie value -> 200 and replaced by a fresh v4 id  [200]

== H: headless Chromium (390x844, container none) ==
PASS  H0  browser A holds hb_visitor: httpOnly, secure, sameSite Lax, v4  [true/true/Lax]
PASS  H0b  browser A keeps the same id across navigations (cookie sent back over http://127.0.0.1)  []
PASS  H1  /reservations shows the demo notice (visible)  []
PASS  H2  /order checkout form (cart with 1 item) shows the demo notice (visible)  []
INFO  H2b checkout submit from UI: 503
PASS  H2b  UI checkout submit with no key -> /api/checkout 503 and the not-configured message is shown in the page, no crash  [503]
PASS  H3  browser A books through the UI and lands on its confirmation with its name  [/reservations/HR-J57RT]
PASS  H4  browser B opens A confirmation URL -> 404, A name absent  [404]
PASS  H5  browser B /admin/reservations: A booking absent, scope note shown  []
PASS  H6  browser A /admin/reservations: own booking present  []
PASS  H7  browser A: no console errors across home, menu, reservations, order, booking, admin (the one expected 503 resource error from H2b excluded)  [Failed to load resource: the server responded with a status of 503 (Service Unavailable)]
PASS  H8  browser B: only console error is the expected 404 resource load  [Failed to load resource: the server responded with a status of 404 (Not Found)]

== Q: repo's own assertions (verify/smoke.yml, assertions/home.yml, assertions/reservations.yml) against container none ==
PASS  Q1  smoke.yml / http_status 200  [200]
PASS  Q2  smoke.yml / text_present Dinner by the water, minus the production  []
PASS  Q3  smoke.yml / text_present Harbor Bistro  []
PASS  Q4  smoke.yml / text_present Coastal-inspired, locally sourced  []
PASS  Q5  smoke.yml / selector_present main  []
PASS  Q6  smoke.yml / selector_present a[href='/reservations']  []
PASS  Q7  smoke.yml / selector_present a[href='/menu']  []
N/A  Q8  smoke.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q9  smoke.yml /menu http_status 200  [200]
PASS  Q10  smoke.yml /menu text_present The Menu  []
PASS  Q11  smoke.yml /menu text_present cooked to order  []
PASS  Q12  smoke.yml /menu selector_present main  []
N/A  Q13  smoke.yml /menu header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q14  smoke.yml /reservations http_status 200  [200]
PASS  Q15  smoke.yml /reservations text_present Reserve a Table  []
PASS  Q16  smoke.yml /reservations text_present Tables for 1 to 12  []
PASS  Q17  smoke.yml /reservations selector_present form  []
PASS  Q18  smoke.yml /reservations selector_present input#date  []
PASS  Q19  smoke.yml /reservations selector_present select#partySize  []
PASS  Q20  smoke.yml /reservations selector_present input#name  []
PASS  Q21  smoke.yml /reservations selector_present input#phone  []
N/A  Q22  smoke.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q23  smoke.yml /order http_status 200  [200]
PASS  Q24  smoke.yml /order text_present cart  []
PASS  Q25  smoke.yml /order selector_present main  []
N/A  Q26  smoke.yml /order header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q27  smoke.yml /about http_status 200  [200]
PASS  Q28  smoke.yml /about text_present Harbor Bistro  []
PASS  Q29  smoke.yml /about selector_present main  []
N/A  Q30  smoke.yml /about header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q31  smoke.yml /api/reservations?date=2026-07-04 http_status 200  [200]
PASS  Q32  smoke.yml /api/reservations?date=2026-07-04 json_path_equals $.slots  [["16:00","16:30","17:00","17:30","18:00","18:30","19:00","19]
PASS  Q33  assertions/home.yml / http_status 200  [200]
N/A  Q34  assertions/home.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q35  assertions/home.yml / text_present Dinner by the water, minus the production  []
PASS  Q36  assertions/home.yml / text_present Coastal-inspired, locally sourced, weeknight-easy.  []
PASS  Q37  assertions/home.yml / text_present Reserve a Table  []
PASS  Q38  assertions/home.yml / text_present See the Menu  []
PASS  Q39  assertions/home.yml / text_present This week  []
PASS  Q40  assertions/home.yml / text_present Good fish, short menu, honest hours  []
PASS  Q41  assertions/home.yml / text_present 412 Harborline Drive  []
PASS  Q42  assertions/home.yml / text_present Tue-Sun from 4pm  []
PASS  Q43  assertions/home.yml / text_present Harbor Bistro  []
PASS  Q44  assertions/home.yml / selector_present main  []
PASS  Q45  assertions/home.yml / selector_present section  []
PASS  Q46  assertions/home.yml / selector_present a[href='/reservations']  []
PASS  Q47  assertions/home.yml / selector_present a[href='/menu']  []
PASS  Q48  assertions/home.yml / selector_present ul li a[href^='/menu/']  []
PASS  Q49  assertions/home.yml / selector_present header  []
PASS  Q50  assertions/home.yml / selector_present [data-testid='demo-banner'], footer, [class*='DemoBanner'], [class*='demo']  []
PASS  Q51  assertions/home.yml / lcp_under_ms 1500 (local origin)  [72 ms]
PASS  Q52  assertions/home.yml / no_console_errors   []
SKIP  Q53  assertions/home.yml / axe_no_critical   [axe-core not in harness]
PASS  Q54  assertions/reservations.yml /reservations http_status 200  [200]
N/A  Q55  assertions/reservations.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q56  assertions/reservations.yml /reservations text_present Reserve a Table  []
PASS  Q57  assertions/reservations.yml /reservations text_present Tables for 1 to 12  []
PASS  Q58  assertions/reservations.yml /reservations text_present Walk-ins always welcome at the bar  []
PASS  Q59  assertions/reservations.yml /reservations text_present Hours  []
PASS  Q60  assertions/reservations.yml /reservations text_present Tuesday  []
PASS  Q61  assertions/reservations.yml /reservations selector_present form  []
PASS  Q62  assertions/reservations.yml /reservations selector_present input#date  []
PASS  Q63  assertions/reservations.yml /reservations selector_present select#partySize  []
PASS  Q64  assertions/reservations.yml /reservations selector_present input#name  []
PASS  Q65  assertions/reservations.yml /reservations selector_present input#phone  []
PASS  Q66  assertions/reservations.yml /reservations selector_present input#email  []
PASS  Q67  assertions/reservations.yml /reservations selector_present textarea#notes  []
PASS  Q68  assertions/reservations.yml /reservations selector_present button[type='submit']  []
PASS  Q69  assertions/reservations.yml /reservations selector_present select#partySize option[value='12']  []
PASS  Q70  assertions/reservations.yml /api/reservations?date=2026-07-07 json_path_equals $.isClosed  [false]
PASS  Q71  assertions/reservations.yml /api/reservations?date=2026-07-06 json_path_equals $.isClosed  [true]
PASS  Q72  assertions/reservations.yml /reservations no_console_errors   []
SKIP  Q73  assertions/reservations.yml /reservations axe_no_critical   [axe-core not in harness]

== R: runtime ==
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-live  live: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rk  rk: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rklive  rklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-pklive  pklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-ret  ret: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-legacy  legacy: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 220/220 passed  ({"PASS":220,"FAIL":0,"N/A":7,"SKIP":2})
```

Curated edge categories covered: missing and malformed input (no body,
garbage JSON, wrong types, missing fields), max inputs (1 MB name, 1 MB
checkout body, 4 KB cookie), special characters (HTML, unicode, apostrophes,
SQL-shaped ids and cookies), race conditions (20 concurrent same-slot
bookings, 20 concurrent first visits), empty states (unknown ids), and denied
permissions (the whole X matrix). slow_network has no surface in this PR.

## 3. Theater Check

| PR #28 claimed | Verification found | Verdict |
|---|---|---|
| `/admin`, `/admin/orders`, `/admin/reservations` show only seed data plus the caller's own records | 14 attacker identities (another visitor, no cookie, forged `seed`/`SEED`/url-encoded seed, foreign v4, A's id uppercased, wrong version nibble, suffixed, duplicate cookies both orders, empty, 4 KB junk, SQL-shaped) all got 200 with 0 of A's names, phone, emails or ids, seed shown, legacy hidden (X*b); A saw its own (P13, P14); headless B did not see A's UI booking (H5) | CONFIRMED |
| Header counts are scoped | A 11 active, B 11 (one own order each), cookieless 10 = seed only (P20) | CONFIRMED |
| Admin POSTs on another visitor's record are 404 with the same body as an unknown id | advance, cancel and reservation cancel on A's records: 404 with byte-identical bodies for all 14 identities (X*c); A's rows unchanged afterwards (P21) | CONFIRMED |
| Public detail routes 404 unless seed or own | `/reservations/<id>`, `/order/confirmation/<id>`, `/api/orders/<id>`: 404 for all 14 identities with 0 PII (X*a); 200 random guessed order codes resolved 0 foreign orders (P22); headless B 404 on A's confirmation URL (H4) | CONFIRMED |
| `/api/orders/<id>` returns no PII | keys are `id,status,statusLabel,fulfillment,updatedAt` (P12) | CONFIRMED |
| `hb_visitor`: HttpOnly, SameSite=Lax, Path=/, Secure in production, 30 days | Set-Cookie verbatim in P2 (Max-Age=2592000); Chromium stores it httpOnly, secure, Lax (H0) | CONFIRMED |
| Anything but a lowercase v4 UUID, including `seed`, is replaced | every malformed identity got seed-only scope (X3 to X14); 4 KB value replaced by a fresh v4 (E23) | CONFIRMED |
| A newly minted id is used on the same request, and nothing is written untagged | cookieless create: 201, the row's `visitor_id` equals the id in the Set-Cookie (P9); after all writes the only NULL rows are the 2 deliberate legacy probes (P26); checkout's pending row is tagged (K-test-2) | CONFIRMED |
| Stripe reconcile on the confirmation page runs after the scope check | B on A's pending order with `?session_id=`: 404 and 0 connections to the pinned Stripe host; A on the same URL: 200 and 3 connections (K-test-3, K-test-4) | CONFIRMED |
| Slot availability stays unscoped and carries no PII | slots API returns times and `isClosed` only (Q32, Q70, Q71); static audit (P27) | CONFIRMED |
| In-place migration: seed rows backfilled by ISO timestamp, other existing rows kept as NULL and hidden, not deleted | pre-tagging DB booted in Docker: column and indexes added, 20/15 seed rows backfilled, 4 legacy rows kept NULL (including 48h-old ones, not purged at boot), all legacy detail/API/admin routes 404 even with a forged `seed` cookie (M1 to M8) | CONFIRMED |
| Demo notice on the checkout and reservation forms; admin screens explain the scope | visible on `/reservations` and the `/order` checkout form (H1, H2); scope note on `/admin/reservations` (H5) | CONFIRMED |
| Stripe guard refuses any secret not starting `sk_test_`, and a set publishable key not starting `pk_test_`; checkout 503; boot log refusal; rest of the demo stays up | `sk_live_`, `rk_test_`, `rk_live_`, `sk_test_`+`pk_live_`: 503, 0 Stripe connections, 0 order rows, `[startup]` refusal in the log, `/` 200 (K section, R section); no key: 503 "not configured" | CONFIRMED |
| No key material reaches the browser | 0 `sk_`/`rk_`/`pk_live_` keys and 0 exact env values across 10 pages, 17 JS chunks and the 503 body in every container (K-*-scan) | CONFIRMED |
| Webhook route unchanged | empty diff on `src/app/api/webhooks` | CONFIRMED |
| 24h retention: visitor rows older than 24h deleted, seed never, legacy NULL only with `INCLUDE_LEGACY=1`; runs at boot, then at most hourly | backdated rows in Docker: -25h gone in both timestamp formats, -23h kept, seed and NULL at -100h kept, log "deleted 2 orders and 2 reservations" (T1 to T6); 6 requests inside the hour did not purge (T1); host script: dry run, default and `INCLUDE_LEGACY=1` each behave as documented (Layer 1) | CONFIRMED for boot purge, throttle and script; hourly re-fire NOT OBSERVED (would need a 1-hour wait) |
| 92/92 tests, tsc clean, lint 0 errors / 3 warnings, build clean, seed + verify pass | reproduced exactly (Layer 1) | CONFIRMED |
| Portal handoff unchanged, no "see everything" path added | `portal-handoff` route not in the diff; no code reads `hb_session` for admin | CONFIRMED (static only) |
| "I did not apply the `tier-3` label" | the PR does carry `tier-3` now (applied after the PR was written) | STALE, not theater |

## 4. Blockers

None.

## 5. Warnings

### The CI deep-verify gate is not PR-scoped (process, recommend a follow-up chore)

`verify/ci/deep_gate.sh` greps every file in `verify/reports/` for a PASS
marker. The PR #25 report already contains "Overall: PASS", so **every**
later tier-3 PR in this repo passes the "Deep Verify" job without a report of
its own. That is what happened here: #28's Deep Verify job was green and the
PR merged at 06:44:59Z, before this report existed. The code turned out to be
sound, but the gate did not prove it. Recommend a chore that makes the gate
require a report that names the PR head, for example by matching the new
`Tested-SHA:` line against `github.event.pull_request.head.sha`.

### Deploy note: the live container has no data volume

A read-only `docker inspect` of the live `demo-harborbistro` container shows
no mounts (`[]`). Per the Dockerfile the database is baked into the image and
runtime writes live in the container layer. So the next redeploy replaces the
live database with a fresh seed: the old visitor-entered rows disappear with
the old container, and the in-place migration path (proven here in M1 to M8)
will not actually run against today's live rows. This answers the PR's open
caveat. It also means the one-time `INCLUDE_LEGACY=1` purge question is moot
unless a volume is added before the redeploy. Per the PR, deploy #28 before
removing the proxy containment for `/admin` and `/api/admin`.

### Pre-existing, not introduced by this PR

- **Checkout with an unreachable Stripe returns 500 with an empty body and
  leaves a `pending` order row** (K-test-1, K-test-2). `sessions.create` is
  not wrapped in a try/catch, so the Stripe connection error surfaces as an
  unhandled 500. The row is tagged, hidden from the admin lists (pending is
  neither active nor recent) and will be purged after 24h, so it is not a
  leak. The same code path exists on `c631da4`. A 502 with a message would be
  friendlier.
- **No request size cap on `/api/reservations`**: a 1 MB name was stored
  (E9, 201). The retention purge now bounds how long it lives.

### Minor

- The hourly purge only fires when something opens the database, so on an
  idle server a row can outlive 24h until the next request, and after the
  first boot run the effective window is 24 to 25 hours. That fits "about a
  day" and the scope note's "deleted after 24 hours" is close enough for a
  demo.
- The cookie is `Secure` in production. Chromium accepts it on
  `http://127.0.0.1` (H0b), and the public site is HTTPS, so this only matters
  if the image were ever served over plain HTTP on a non-localhost host (every
  request would then look like a new visitor).

## 6. Coverage gaps (stated so the PASS is not overclaimed)

- **Layer 5 (headed Chrome) was not run**: a sibling session was using the
  browser. Headless Chromium covered the same flows.
- **Real Stripe never ran.** A test-mode Checkout Session, the redirect, the
  return trip carrying the Lax cookie, and the webhook marking an order paid
  were not exercised, because no Stripe account or key exists. The guard was
  proven by refusal and by counted connection attempts, not by a successful
  session. Orders for the scope matrix were inserted directly into each
  container's database in `received`/`completed` status.
- The hourly re-fire of the automatic purge was not observed (only its
  negative: no purge inside the hour).
- No live database was examined; the migration was proven on a synthetic
  pre-tagging database built from the seed.
- axe (2 assertions) was skipped, HSTS (7) is edge-only, cross-browser is
  Chromium only, and the adversarial generator was not run.

## 7. Harness corrections (runs 1 and 2)

Recorded so the clean total above is auditable:

- Run 1 counted the order and booking codes that the 404 page echoes back
  from the request path as "leaks", and the YAML parser tripped on CRLF line
  endings. Fix: the detail-route leak check looks for names, phones and
  emails only (the admin-view check still includes ids), and the parser
  splits on `\r?\n`.
- Run 2 failed E11, H2 and H3. E11: re-saving the harness through PowerShell
  mangled its non-ASCII test string, so it sent different text than it
  checked for (the app's escaping was verified correct by hand). H2: the
  `/order` notice only renders on the checkout form, so the check now adds an
  item to the cart first. H3: reservation ids are `HR-`, not `RS-`.
- Run 3 ran on freshly recreated containers with the fixed harness.

## 8. Cleanup

All `dv28-*` containers and the `demo-harborbistro:dv28` image were removed
after the run. The scratch npmrc was deleted right after the build.
