# Deep Verify: PR #36 signed hb_visitor cookie (D-018) (2026-09-19)

Overall: PASS
Tested-SHA: 355b9df28de6e097d374d4f9a77593d080169ff1

Every claim in the PR body held under an independent attack run against the
production Docker image. The signing format was recomputed from scratch with
`node:crypto` and matched byte for byte; no forged, unsigned, tampered,
foreign-secret, non-canonical or duplicate cookie ever gained another
visitor's scope on any read or write path; with no usable `SESSION_SECRET`
both write paths answer 503 before the body is read and before Stripe, with
no row and no Stripe session; and a secret rotation kills old cookies on the
next restart.

Totals:
- attack harness: **92 of 92**;
- rotation and runtime-env suite: **12 of 12**;
- supplementary probes (`/api` without middleware, split Cookie headers,
  duplicate floods, timing sample): **9 of 9**;
- 32 character boundary probe: **1 of 1**;
- the repo's own two-browser script `npm run verify:visitor-scope`:
  **25 of 25**;
- unit tests `npx vitest run`: **183 of 183** in 19 files;
- real-server suite `vitest.server.config.ts`: **18 of 18** on 3 of 4 runs
  (one pre-existing #31 timing assertion missed its 2 s bound by 101 ms on the
  first run, while the machine was loaded; see W3);
- `tsc --noEmit` clean, lint 0 errors and 4 pre-existing warnings;
- combined live checks: **139 of 139**.

Blockers: none. Warnings: 9, none blocking. This PASS does not cover headed
Chrome, a headless browser layer, real Stripe, the live proxy or the public
URL (see section 8).

## 1. Target and scope

- **PR:** Ginkobaloba/demo-harborbistro #36, `fix/signed-visitor-cookie`,
  label `tier-3`.
- **Head tested:** `355b9df28de6e097d374d4f9a77593d080169ff1`, taken from the
  worktree `C:\dev\demo-harborbistro-wt-svc` (clean tree, up to date with
  `origin/fix/signed-visitor-cookie`).
- **Tier:** `verify/tier_map.yml` marks `reservations` and `order-checkout`
  tier 3, `deep_verify_before_merge: true`. Both are changed by this PR, so
  the deep gate applies.
- **Mode:** deep, layers 1, 2, 3 and 6. Layers 4 and 5 (headless and headed
  browser) were not run; the surface under test is cookie and HTTP shaped and
  was exercised at the wire level instead. Stated again in section 8 so this
  report is not read as covering them.
- **Verifier:** an independent session. I did not write this code.

### Environment

- One image, `demo-harborbistro:dv36`, built from the worktree at
  `355b9df` with `docker build --secret id=npmrc,src=<scratch>\creds\npmrc`
  (the id the Dockerfile declares). The build ran `db:seed`, `db:verify` and
  `next build` and exported at 16:14:47, before the 16:15 GitHub token
  rotation the coordinator reported, and exited 0. No 401 occurred and the
  npmrc was never opened or printed.
- One control image, `demo-harborbistro:dv36main`, built the same way from a
  detached worktree at `origin/main` (pre-D-018), for the negative control in
  section 6.
- Throwaway containers, all on 127.0.0.1 only:

  | container | port | `SESSION_SECRET` | purpose |
  |---|---|---|---|
  | `dvh36-good` | 18421 | s1 (64 chars, generated for this run) | main attack surface |
  | `dvh36-nosecret` | 18422 | unset | fail closed |
  | `dvh36-short` | 18423 | 31 chars | fail closed, under the rule |
  | `dvh36-placeholder` | 18424 | the `.env.example` placeholder | fail closed |
  | `dvh36-fake` | 18425 | s1 | checkout against the fake Stripe |
  | `dvh36-rot` | 18426 | s1, then s2, then s1, then unset | rotation, shared sqlite file |
  | `dvh36-fakenosecret` | 18427 | unset | checkout 503 with a fake Stripe listening |
  | `dvh36-min32` | 18428 | exactly 32 chars | the rule's boundary |
  | `dvh36-mainctl` | 18429 | s1 | negative control on pre-PR code |

- Stripe: every container was started with
  `--add-host api.stripe.com:127.0.0.1` and a freshly generated fake
  `sk_test_` key. `dvh36-fake` and `dvh36-fakenosecret` run the dv31
  fake-Stripe server on 127.0.0.1:443 inside the container, trusted through a
  throwaway CA via `NODE_EXTRA_CA_CERTS`. The other containers run the dv31
  counting listener on 443, so any outbound Stripe attempt is recorded. No
  request ever reached the real api.stripe.com.
- The live container, the public URL, demo-proxy and cloudflare-config were
  not touched.
- Evidence (scratch dir `<scratch>\dv36\`): `build.log`, `build-main.log`,
  `setup*.log`, `attack.mjs` and `attack4.log` (final run), `rotate.mjs` and
  `rotate.log`, `extra.mjs` and `extra.log`, `boundary.mjs` and
  `boundary32.log`, `negcontrol.mjs`, `negcontrol.log`, `negcontrol-pr.log`,
  `visitor-scope2.log`, `vitest.log`, `tsc.log`, `lint.log`,
  `build-local.log`, `serversuite.log` and `serversuite-{2,3,4}.log`,
  `log-{good,nosecret,short,placeholder}.txt`.

### Secret rules followed

- Nothing under `C:\Users\Drama\.secrets` was read, opened, hashed or
  printed. No `.env*` file I did not create was opened (`.env.example` was
  seen only as part of the PR diff). The dv31 setup script's
  `--env-file <secrets path>` line was deliberately not reused; every
  container got its environment from explicit `-e` flags.
- `SESSION_SECRET` values are throwaways generated in this run from
  `RandomNumberGenerator`, kept in the scratch dir only.
- The npmrc was used by path only (`--secret id=npmrc,src=...`) and never
  read or echoed.
- Stripe keys were fake `sk_test_` strings generated per container; the only
  Stripe endpoint reachable was the local fake.
- No PowerShell function with a 1 or 2 letter name was defined. Git ran from
  PowerShell only; no bare stash.

## 2. Diff review

`git diff --name-only origin/main...HEAD` lists 25 files and nothing outside
the stated scope:

- signing and secret: `src/lib/visitor.ts`, `src/lib/session-secret.ts` (new),
  `src/lib/visitor-server.ts`, `src/lib/portal-session.ts`,
  `src/instrumentation-node.ts`, `src/middleware.ts`;
- call sites made async: `src/app/api/checkout/route.ts`,
  `src/app/api/reservations/route.ts`, `src/app/api/orders/[id]/route.ts`,
  `src/app/api/admin/orders/[id]/route.ts`,
  `src/app/api/admin/reservations/[id]/route.ts`;
- tests: `src/lib/visitor.test.ts` (new), `src/middleware.test.ts`,
  `src/lib/visitor-scope.test.tsx`, `src/lib/checkout-guard.test.ts`,
  `src/app/api/checkout/route.test.ts`,
  `src/app/api/reservations/route.test.ts`,
  `test/server/visitor-cookie.server.test.ts` (new),
  `test/server/body-caps.server.test.ts`, `test/server/harness.ts`;
- docs and tooling: `docs/decisions.md` (D-018), `docs/ledger/...`,
  `README.md`, `.env.example`, `scripts/verify-visitor-scope.ts`.

No dependency change: `git diff --stat origin/main...HEAD -- package.json
package-lock.json next.config.ts` prints nothing. The middleware matcher is
unchanged (comments only), so `/api/` still skips the middleware per D-017,
which section 5 confirms live.

Code reading, with what the run confirmed:

- `visitor.ts` verifies with `crypto.subtle.verify` after a strict shape
  check, then compares `toBase64Url(tagBytes) !== tag` so only the canonical
  spelling is accepted, and requires exactly 32 tag bytes. Web Crypto only,
  no Node imports, so the Edge middleware and the Node routes run the same
  code.
- `session-secret.ts` is the only reader of `process.env.SESSION_SECRET` in
  application code (`grep` over `src/` confirms; the other hits are tests).
- Every `scopeFromRequest` and `scopeFromCookieHeader` call site is awaited.
  This is also enforced by types: the functions return a Promise and the data
  layer takes a `VisitorScope`, so a forgotten `await` fails `tsc`, which is
  clean.
- `visitorIdForWrite` refuses (`ok: false`) when the secret is unusable and
  otherwise never adopts a claimed id: it either reuses a verified cookie or
  mints and signs a fresh uuid.

## 3. Claim 1: the cookie format

Evidence: `attack4.log` section A, `boundary32.log`.

- `A1`, `A2`: a page view mints `hb_visitor=<v4 uuid>.<43 char base64url>`,
  total length 80.
- `A3`: the tag equals an **independent** `node:crypto` computation of
  `base64url(HMAC-SHA-256(HMAC-SHA-256(SESSION_SECRET,
  "harborbistro:visitor-cookie:v1"), uuid))`, byte for byte, on the good
  container, the fake-Stripe container (`F1`), the rotation container under
  two different secrets (`R1`, `R4`) and the 32 character container.
- `A4`: the tag is **not** `HMAC(secret, uuid)`, so the label is really
  applied and the visitor key is domain separated from the portal JWT key.
- Cookie attributes straight off the production image (verbatim):

```
hb_visitor=8ebf6e7e-283b-4b82-a6ed-120788b72048.3eIb7hkZowxtN-PutGbgbw392Tmk36IGYutxpYlxZ_c; Path=/; Expires=Mon, 19 Oct 2026 21:28:45 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax
```

  `HttpOnly`, `Secure` (the image sets `NODE_ENV=production`), `SameSite=Lax`
  as D-016 requires for the return trip from Stripe, `Path=/`,
  `Max-Age=2592000` (30 days).
- `A9`: a valid cookie is not re-minted on the next page view, so the
  middleware verifies rather than blindly re-issuing.

## 4. Claim 2: an untrusted cookie is never trusted

### 4.1 Reads (17 cookie shapes x 4 surfaces)

Every variant below was sent as the victim's `hb_visitor` against
`/reservations/<victim id>` (page), `/admin/reservations` (page listing),
`POST /api/admin/reservations/<victim id>` (route) and
`GET /api/orders/...` (route). Every one gave 404 on the detail page, 404 on
the admin POST, and no trace of the victim's name in the admin listing:

`bare-uuid` (the pre-D-018 cookie), `tampered-tag`, `foreign-secret` (signed
under a different `SESSION_SECRET`), `raw-secret-no-label` (`HMAC(secret,
uuid)`), `other-label` (`slatewell:visitor-cookie:v1`), `non-canonical-tail`
(the same 32 tag bytes spelled with the 2 spare bits set), `padded-tag`
(`=` appended), `standard-b64-tag` (`+` and `/` alphabet),
`uppercase-uuid`, `double-dot`, `empty-tag`, `tag-only`, `seed-claim`
(`seed.<valid tag over "seed">`), `prefix-junk`, `short-tag-42`,
`random-tag`, `victim-id-attacker-tag` (another visitor's real tag on the
victim's id).

- `C-no-mutation`: after all of that the victim's reservation is still
  `confirmed`, so no admin action slipped through.
- `C-control-admin`: with the real cookie the owner sees the owner's booking
  and not the other visitor's, so the checks are not passing because the page
  is broken.
- `C2-standard-b64-rejected`: the `+`/`/` alphabet test is only meaningful
  when the canonical tag actually contains `-` or `_`, so the harness minted
  visitors until one did (tag ending `uqVEV8`), then proved the standard
  alphabet spelling gives 404 while the canonical one gives 200. Without this
  guard the case silently passes about a quarter of the time.

Not a forgery, recorded for completeness (`C-encoding-equivalence`): a
percent-encoded dot (`<uuid>%2E<tag>`) is decoded by both parsers and works,
and surrounding whitespace is trimmed. Both require the real tag, so no scope
is gained; this is an encoding of the visitor's own cookie, not a bypass.

### 4.2 Writes never adopt a claimed id

`E-*`: for each of six untrusted shapes on the victim's id, `POST
/api/reservations` returned 201, set a **fresh** cookie whose id differs from
the claimed one, whose tag matches the independent HMAC, and the database row
for the new booking carries the minted id, not the claimed one. The victim's
own valid cookie then gets 404 on that new booking, which is the sharp end of
"never adopted".

`F3` to `F5` do the same for checkout on the fake Stripe: a tampered cookie
claiming the victim's id produced a 200 with a new signed cookie,
`orders.visitor_id` equal to the minted id, 404 on
`/order/confirmation/<id>` and `/api/orders/<id>` for the tampered cookie,
and 200 for the freshly minted one.

`B3`: a valid signed cookie is reused as is, with no new `Set-Cookie`.

### 4.3 Duplicate cookies and a sibling host (attack 1)

Six duplicate arrangements were sent in one `Cookie` header, in both orders,
including a valid attacker cookie next to the victim's bare id, next to a
tampered victim cookie, and next to a foreign-secret victim cookie, plus a
noise case with unrelated cookies around them. Three more were sent as two
separate `Cookie:` header lines (the shape a proxy or a parent-domain cookie
from a sibling host produces), and two as 40 duplicate pairs in each order.

In every arrangement the victim's page was 404, the admin POST on the
victim's row was 404, and the victim's name never appeared in the admin
listing. Scope was only ever lost, never gained. The `routeOnAttackerRow`
column in `attack4.log` shows the mechanism and is the source of W1: the page
path (Next's `RequestCookies`) takes the **last** `hb_visitor` pair, while
the route path (`readCookie`) takes the **first**, so a duplicate can strip
the attacker's own scope on one surface and keep it on the other. Both
directions are lose-only because an attacker cannot produce a valid tag for
an id that is not theirs.

## 5. Claim 3: no usable secret fails closed, before the body and before Stripe

For `unset`, 31 characters and the published placeholder, on the production
image (`G-*`):

- `GET /` renders 200 and sets **no** cookie.
- `POST /api/reservations` and `POST /api/checkout` answer 503 with exactly
  `{"error":"Online ordering and reservations are temporarily unavailable in
  this environment."}`.
- **Before the body is read:** a 64 KB body to `/api/checkout` (well over the
  32 KB cap) returns **503, not 413**. A request declaring
  `Content-Length: 5242880` and then sending only 200 bytes and stopping got
  its 503 in 4 to 6 ms, long before any upload could finish.
- **Before Stripe:** the in-container listener on 443 recorded 0 connection
  attempts, and on `dvh36-fakenosecret`, where a working fake Stripe was
  listening, `/tmp/fake-req.log` stayed empty. So no Checkout Session is
  created.
- **No rows:** reservation and order counts were identical before and after
  (15 and 20 on each container).
- Detail pages 404 with no cookie, and the admin pages still render seed data.
- The 32 character boundary is usable: `dvh36-min32` minted a cookie matching
  the independent HMAC and booked 201, then read its own booking 200.

Boot logging (`log-*.txt`): the good container logs **no** `[session-secret]`
line and does not contain the secret value anywhere. Each failing container
logs the rule, naming the problem (`is not set`, `is shorter than 32
characters`, `is still the published .env.example placeholder`) and never the
value. The count is 3 identical lines per process, not 1 (W2), and it stays 3
after 5 further page views, so it is bounded and not per request.

`/api` still skips the middleware (D-017): `GET /api/reservations?date=...`
returns 200 with no `Set-Cookie`, while `GET /menu` mints one
(`X1`, `X2`).

## 6. Claim 4: rotation, the live key cache, and the Edge middleware at runtime

`rotate.log`, one image, one sqlite file on a bind mount, the container
recreated between phases:

| phase | secret | result |
|---|---|---|
| 1 | s1 | cookie verifies under s1 and not s2 (`R1`, `R1b`); booking 201; owner reads it 200 (`R2`) |
| 2 | s2 | the phase 1 cookie is dead: the same read is 404 (`R3`); a page view mints a **new** id signed under s2 and not s1 (`R4`); the dead cookie's id was not adopted (`R5`); the reservation row survives, still tagged with the old id (`R6`) |
| 3 | s1 again | the original cookie verifies again (`R8`), so the key is derived from the environment, not random per process |
| 4 | unset | pages render, no cookie is set (`R9`), reads are seed only (`R10`), writes 503 (`R11`) |

This is also the proof for attack 5: the **same production image**, with only
the environment changed, produces cookies that verify under whichever secret
that container was started with, and none at all without one. Nothing about
the secret is baked into the build, including in the Edge middleware, whose
mint and verify behaviour changed with the environment on every phase.

`R7` records something true by design and worth stating: an operator who
holds the current secret can re-sign any id, so visitor ids are not secrets,
the tag is the gate.

### Negative control

The same probe against `demo-harborbistro:dv36main`, built from `origin/main`:

```
pre-PR image (origin/main): minted cookie = f0cbdbaf-a79d-4478-b8f1-ef5e2e4c2b82 (len 36, signed=false)
book=201 id=HR-WWRJ6 ownRead=200 bareIdRead=200 bareIdAdminPost=200 noCookieWrite=201
NEGATIVE CONTROL: the bare id DOES grant the victim's scope here (pre-D-018 hole reproduced)

PR image (355b9df): minted cookie = 838216b2-164d-4e34-a40b-923179333e89.CCSDwuWAvowmZ8t_6Fmh6hMDK-JU_3j6HsnamtOK_N0 (len 80, signed=true)
book=201 id=HR-R4BPC ownRead=200 bareIdRead=404 bareIdAdminPost=404 noCookieWrite=201
```

The harness reproduces the bearer-token hole on the old code and shows it
closed on this PR, so the 404s above are the fix working, not a harness that
cannot tell the difference.

## 7. Claim 5: the PR #28 and #31 guarantees still hold

- **#28 two-browser isolation.** The repo's own script,
  `BASE_URL=... HARBOR_DB_PATH=... npm run verify:visitor-scope` against the
  built standalone server: **25 passed, 0 failed**, including the admin
  listings, both detail pages, `/api/orders/[id]`, both admin POSTs and the
  legacy untagged order. The harness repeats the same guarantees end to end
  with real orders through the fake Stripe (`J1`, `J1b`, `J2`, `J3`, `J4`):
  each visitor sees only its own booking and order in the kitchen and
  reservation views, gets 404 on the other's detail pages, API and admin POST,
  and cannot change the other's row.
- **#31 byte caps.** Live on the production image: 413 for an over-cap
  reservation body, an over-cap checkout body and an over-cap admin action,
  and 413 in 2 ms for a declared 5 MB upload that never finishes (`I1` to
  `I4`). The builder's `body-caps.server.test.ts` passes in the server suite
  (W3 covers the one flaky run). Tip handling is untouched by this PR and is
  covered by the unit suite.
- **Server suites.** `npx vitest run`: 183 of 183 in 19 files.
  `vitest.server.config.ts` against the freshly built standalone server: 18 of
  18 in 2 files on runs 2, 3 and 4.

## 8. Theater Check

| Agent claimed | Verification found | Verdict |
|---|---|---|
| `hb_visitor = <uuid>.<base64url HMAC-SHA-256(visitorKey, uuid)>`, `visitorKey = HMAC(SESSION_SECRET, "harborbistro:visitor-cookie:v1")` | Recomputed independently in `node:crypto` on four containers and two secrets; byte identical, and not equal to `HMAC(secret, uuid)` | CONFIRMED |
| Web Crypto only, canonical base64url only | No Node imports in `visitor.ts`; the Edge middleware and the routes behave identically; non-canonical tail, `=` padding, `+`/`/` alphabet, 42 char tag all rejected live | CONFIRMED |
| Untrusted cookies read as seed only or 404 | 17 shapes x 4 surfaces, all 404 or seed only, no mutation | CONFIRMED |
| Writes mint a fresh signed visitor, a claimed id is never adopted | 6 shapes on reservations and a tampered cookie on checkout: fresh signed cookie, DB row carries the minted id, the claimed id cannot read the record | CONFIRMED |
| No usable secret: 503 before the body and before Stripe, no row, no session | 503 beats 413 on a 64 KB body; 503 in 4 to 6 ms on a 5 MB declared upload; 0 Stripe connection attempts; empty fake-Stripe log; row counts unchanged | CONFIRMED |
| Pages render with no cookie when the secret is unusable | 200 with no `Set-Cookie` on all four no-secret configurations | CONFIRMED |
| The server logs the rule once at boot, never the value | Logged, never the value, bounded and constant under traffic, but 3 identical lines per process, not 1 | CONFIRMED with a correction (W2) |
| PR #28 scope guarantees still hold | Repo script 25 of 25, plus an independent end to end repeat | CONFIRMED |
| PR #31 byte caps still hold | 413 on all three over-cap surfaces and on a never-ending upload | CONFIRMED |
| 183 of 183 unit tests, 18 of 18 server tests, clean `tsc`, 0 lint errors with 4 pre-existing warnings | Reproduced exactly (server suite: see W3) | CONFIRMED |
| "I haven't checked whether prod sets `SESSION_SECRET` today" | Honest at the time; the parent session has since confirmed the production value is 128 characters (length only), which I did not and could not re-check | CONFIRMED as stated |

Nothing in the PR body was found to be theater.

## 9. Blockers

None.

## 10. Warnings (passed, but worth knowing)

**W1. Two cookie parsers disagree on duplicates.** `readCookie` (routes)
takes the first `hb_visitor` pair, Next's `RequestCookies` (middleware and
server components) takes the last. Both are lose-only for an attacker, but a
cookie injected on a parent domain by a sibling host can strip a visitor's own
scope on the page surfaces while the API surfaces still see the real cookie,
which would look like "my booking vanished" while `/api/orders/<id>` still
answers 200. A cheap alignment is to have `readCookie` return the last match,
or to reuse one parser everywhere. Not a scope escalation and not a blocker.

**W2. "Logged once at boot" is three times per process.** Each unusable
secret produces 3 identical `[session-secret]` lines (Node instrumentation
plus the other runtimes that import the module, including the Edge isolate).
Bounded, constant under load, never the value. The PR body and D-018 say
"once"; the code says once per problem per module instance.

**W3. One server-suite timing flake.** The first run of
`test/server/body-caps.server.test.ts` failed
"answers 413 up front for a declared Content-Length over the cap" at 2101 ms
against a 2000 ms bound, while the image build and seven containers were
loading the machine. Three later runs passed with room to spare, and the live
equivalent answered in 2 to 6 ms. This is the pre-existing #31 assertion, not
new to this PR, but it is tight enough to redden CI on a busy runner.

**W4. `scopeFor` is still exported and takes an unverified id.** Its comment
says never to pass a raw cookie value, and no caller does today, but the
unsafe entry point remains next to the safe one. Consider making it internal.

**W5. The derived key is cached as a Promise keyed by the secret string.** If
`subtle.importKey` ever rejected, the rejected promise would stay cached for
the life of the process and every later verify would throw rather than retry.
Implausible in practice, cheap to make self healing.

**W6. Percent-encoded and whitespace-padded cookie values are accepted.**
`<uuid>%2E<tag>` decodes to the same cookie on both surfaces. No scope is
gained (the real tag is still required), but it means the wire form of the
cookie is not unique.

**W7. Ids are not secrets, and that is now load bearing.** Anyone holding the
current `SESSION_SECRET` can re-sign any visitor id (`R7`). That is the
intended design, but it means secret handling is the whole of the guarantee.

**W8. Every existing visitor loses its demo data on deploy.** Accepted in
D-018 (data expires in about a day), confirmed live: a pre-D-018 bare cookie
becomes a fresh visitor on the next page view and the old rows stay in the
database, tagged with an id nobody can present any more.

**W9. The deploy gate is real.** Without a 32+ character `SESSION_SECRET` in
production, ordering and reservations answer 503 on every attempt. The parent
session reports the production value is 128 characters (length only checked);
I did not verify the production environment myself, by rule.

## 11. Coverage gaps (so this report is not overclaimed)

- **Layer 4 and 5 not run:** no headless browser and no headed Chrome. Cookie
  attributes, scope and 503s were checked at the HTTP level. A real browser
  would additionally prove the `Secure` attribute does not break the demo over
  plain HTTP behind the proxy (the proxy terminates TLS, so this is the same
  posture as before the PR, but it was not exercised).
- **Real Stripe was never contacted.** All checkout runs used the local fake
  or were refused before any Stripe call.
- **The live deployment, the public URL, demo-proxy and cloudflare-config were
  not touched**, so nothing here says the deployed demo is in this state.
- **Timing was not measured at the crypto level.** Verification uses
  `crypto.subtle.verify`, which is constant time by contract; the HTTP level
  medians (valid 3.81 ms, wrong tag 4.09 ms, wrong last character 3.54 ms) are
  dominated by request noise and prove nothing either way. Confirmed by code
  reading only. The shape check short circuits before any key work, which
  leaks only the shape, not the tag.
- **The portal `hb_session` path** now shares `session-secret.ts`. That is
  covered by the unit suite (183 of 183, including `portal-session.test.ts`
  and the portal handoff route tests) but was not exercised live with a real
  portal JWT.
- **The first attempt to run the repo's isolation script against a container
  with a bind-mounted sqlite file produced 7 false failures** (host writes are
  not reliably visible to the container over the Docker Desktop mount). The
  clean 25 of 25 run was against the local standalone server, which is the
  usage the script documents. Recorded so the earlier log is not mistaken for
  a defect.

## 12. Cleanup

All nine `dvh36-*` containers, both images (`demo-harborbistro:dv36` and
`demo-harborbistro:dv36main`), the temporary `origin/main` worktree and the
bind-mounted rotation database were removed at the end of the run. The
scratch logs listed in section 1 are kept outside the repo.
