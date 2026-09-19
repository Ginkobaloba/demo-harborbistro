# Deep Verify: PR #31 checkout 503 with no order row, public request body caps (2026-09-19)

Overall: FAIL
Tested-SHA: 0a837249dd04a476928880164f831044b6a5e2cb

Claim (1), the payment path, held under every attack: when Stripe is refused,
reset, rejects, errors, returns garbage, returns no URL or never answers,
checkout gives the fixed JSON 503, writes no order row and leaks nothing. The
row is written only after Stripe hands back a session, proven by a fake Stripe
that looked in the database while it was being called. Field limits, the
non-string refusal, the 50-line cart cap and the exact byte boundaries of all
four routes also held, and PR #28's guarantees did not regress (221 of 221).

**Claim (2) did not hold on the real production server.** The byte cap is
applied only after the whole upload has arrived. The PR says that
`readJsonBody` "refuses a declared Content-Length over the cap" and that
"a chunked or understated upload is cut off with 413". On `next start`
(standalone, NODE_ENV=production) neither happens. A never-ending chunked
upload got no response at all, and neither did a request declaring
`Content-Length: 1000000`. Next's middleware runs on every `/api/` route, and
it clones and buffers the request body (up to 10 MB) and waits for the body to
end before the route handler runs. So the handler's streaming cap never gets a
chance. The outcome guarantees still hold: every over-cap request ends in 413
and nothing is stored. But the "enforced while reading" mechanism is theater
outside the in-process unit tests. A diagnostic run of the same image with the
middleware told to skip `/api/` restored the claimed behaviour (413 after 68 ms
mid-upload, and 11 ms for an oversized declared length). That points straight
at the fix; see Blockers.

Totals: the PR #31 attack harness passed 93 of 97. Of its 4 FAILs, 3 are the
defect above (B-R1, B-R2, B-R4), and 1 (B-R3) is withdrawn as evidence
because it cannot tell a working cap from a broken one (see "Harness
corrections"). The PR #28 regression harness passed 221 of 221, plus 7 N/A
(HSTS is edge-only) and 2 SKIP (axe). An in-process probe of the id-collision
logic passed 4 of 4. Layer 1 is clean. Nothing in this run reached the Stripe
API.

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-harborbistro` PR #31, branch
  `fix/checkout-503-body-caps`, head `0a837249dd04a476928880164f831044b6a5e2cb`
  (the head did not move during the run). Worktree
  `C:\dev\demo-harborbistro-wt-fix`, clean before and after.
- **Tier:** Tier-3 (payment path). The PR carries the `tier-3` label, and
  `verify/tier_map.yml` marks `reservations` and `order-checkout` as tier 3.
- **Mode:** deep (`paradigm-verify`): layers 1, 2, 3, 4 and 6 plus a targeted
  adversarial sweep built from the builder's "please attack" list, points (a)
  to (f). **Layer 5 (headed Chrome) was not run** because other agents may be
  using the browser; it is listed as a coverage gap. The separate LLM
  adversarial generator was not run.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human, and not
  the agent that wrote the PR.
- **Environment:** one image, `demo-harborbistro:dv31`, built locally from the
  PR head with `docker build --secret id=npmrc,...`. The npmrc was a temp file
  holding the agent token; it was never printed and was deleted right after
  the build. The build ran `npm run db:seed` ("60 menu items, 20 orders, 15
  reservations"), `npm run db:verify` ("Seed verification passed") and
  `next build` ("Compiled successfully"). Nine throwaway containers ran from it
  on the runtime env file
  `C:\Users\Drama\.secrets\demo_env_harborbistro.local.txt`, with the Stripe
  keys overridden per container:

  | Container | Port | STRIPE_SECRET_KEY | Publishable key | Purpose |
  |---|---|---|---|---|
  | dv31-none | 127.0.0.1:18411 | empty | empty | reservations, admin, portal caps; scope matrix; edge sweep; headless; repo assertions |
  | dv31-test | 127.0.0.1:18412 | fake `sk_test_` | empty | Stripe connection reset (listener on 443); reconcile ordering |
  | dv31-live | 127.0.0.1:18413 | fake `sk_live_` | empty | guard refuses |
  | dv31-rk | 127.0.0.1:18414 | fake `rk_test_` | empty | guard refuses (later replaced by dv31-diag, below) |
  | dv31-rklive | 127.0.0.1:18415 | fake `rk_live_` | empty | guard refuses |
  | dv31-pklive | 127.0.0.1:18416 | fake `sk_test_` | fake `pk_live_` | guard refuses |
  | dv31-ret | 127.0.0.1:18417 | empty | empty | retention; slow-client probes |
  | dv31-legacy | 127.0.0.1:18418 | empty | empty | pre-tagging DB, in-place migration |
  | dv31-fake | 127.0.0.1:18419 | fake `sk_test_` | empty | **fake Stripe** (below): success, no URL, 400, 500, garbage, slow, hang, id collision |
  | dv31-diag | 127.0.0.1:18414 | empty | empty | DIAGNOSTIC ONLY: same image, compiled middleware matcher changed to skip `/api/` |

- **No Stripe API calls, enforced:**
  - Every container ran with `--add-host api.stripe.com:127.0.0.1`, and a
    probe in each one resolved `api.stripe.com -> 127.0.0.1`.
  - Every fake key was 24 random characters behind its prefix (32 in total).
    Probes checked the overrides by prefix and length only, and no key value
    was ever printed.
  - Eight containers ran PR #28's counting listener on `127.0.0.1:443`, which
    logs each connection attempt and drops it.
  - **The fake Stripe:** `dv31-fake` ran a small HTTPS server on
    `127.0.0.1:443` (`fakestripe.js`), presenting a throwaway certificate for
    `api.stripe.com`. The app trusted it only because this one container was
    started with `NODE_EXTRA_CA_CERTS` pointing at a throwaway CA made for
    this run. The app code and the Stripe SDK were not changed. For each
    `POST /v1/checkout/sessions` the fake logged the form body and **checked
    the database for the order id while the call was in flight**. It then
    answered according to a mode file: `ok`, `nourl`, `err400` (an
    `invalid_request_error` / `amount_too_large` whose message is a sentinel
    string holding a fake key, an IP, `ECONNREFUSED` and a stack marker),
    `err500`, `garbage` (a 200 with HTML), `slow:3000`, `hang` (never answers)
    or `collide` (inserts a row with the minted id before answering `ok`,
    which simulates a concurrent writer between `unusedOrderId()` and the
    INSERT). For connection refused (C1), the fake was stopped.
- The live `demo-harborbistro` container, the public URL, demo-proxy and
  `C:\dev\cloudflare-config` were not touched. One file under
  `cloudflare-config` (`nginx/conf.d/harborbistro.conf`) was **read** to check
  the proxy's body limits (see Warnings); nothing was changed.
- Evidence dir (not in the repo):
  `C:\Users\Drama\AppData\Local\Temp\claude\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\scratchpad\dv31\`
  (`attack.mjs`, `regress.mjs`, `rawprobe.mjs`, `fakestripe.js`, `slow.mjs`,
  `diag.mjs`, `setup.ps1`, `attack-final2.log`, `regress-final3.log`,
  `slow.log`, `diag.log`, `unitprobe.log`, `negcontrol.log`, `build.log`,
  `vitest.log`, `lint.log`). The logs below are the clean runs; earlier runs
  are explained under "Harness corrections".

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| payment path (claim 1) | PASS | C1 to C12, U4, U5, K-test-1/2: 7 failure modes give the fixed JSON 503 and 0 rows; the row never exists during the Stripe call |
| request size caps, outcome (claim 2) | PASS | B-*-1/2/3, B-mb, B-1mb, B-R5 to B-R7: every over-cap request gets 413 (portal: `payload_too_large`), nothing stored, exact boundaries right on all 4 routes |
| request size caps, read-time enforcement (claim 2) | **FAIL** | B-R1, B-R2, B-R4 on the real server; mechanism shown by B-R6 (Next's 10 MB clone warning) and B-R7 (memory); fix direction shown by DIAG-1/2 |
| field limits and text types (claim 2) | PASS | F-*: every field at max and max+1, multibyte, trim, non-strings, worst-case encoding |
| error_handling | PASS | E1/E2 (35 malformed carts and bodies: no 5xx, all JSON); C9 (JSON 500 on insert failure) |
| auth_lifecycle (PR #28 regression) | PASS | regression P1 to P27, X1 to X14, H0 to H8 |
| payment guard (PR #28 regression) | PASS | regression K section |
| data retention, migration (PR #28 regression) | PASS | regression T1 to T6, M1 to M8 |
| data_crud | PASS | real bookings and checkouts through the API and the UI; admin transitions |
| edge_cases | PASS except read-time cap | attack sections D, E, F, B; regression E1 to E23 |
| smoke | PASS | repo assertions Q1 to Q73: 62 PASS, 7 N/A, 2 SKIP |
| navigation | PASS | headless menu, cart, order, reservations, confirmation, admin |
| performance | PASS (local) | home LCP under the 1.5 s assertion at the local origin; 150 open slow uploads did not slow `GET /` (S4) |
| mobile_responsive | PASS (partial) | every headless check ran at 390x844 |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| accessibility | SKIP | `axe_no_critical` (2): axe-core is not in the harness |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | Chromium only; headed Chrome not run |

### Layer 1: code (at `0a83724`)

- `npx vitest run`: 16 files, **123 passed / 123**, as the PR states.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 errors, 3 warnings, all `react-hooks/set-state-in-effect`
  in files this PR does not touch.
- `next build`, `db:seed`, `db:verify`: clean inside the Docker build.
- `git diff origin/main...HEAD -- src/app/api/webhooks` is empty, so the
  webhook is untouched as claimed.
- **Negative control reproduced:** the PR's `route.test.ts` run against
  `origin/main`'s `src/app/api/checkout/route.ts` gives "13 tests, 11 failed",
  as the PR says. The file was restored with `git checkout --` right after,
  and the worktree was clean.
- **In-process collision probe** (`zz-dv31-unused-order-id.test.ts`, created
  in the worktree only for the run, then deleted; copy kept in the evidence
  dir; `git status --porcelain` empty afterwards). `newOrderId` was mocked to
  return chosen ids. 4 of 4 passed:
  - V1: two taken ids are skipped and the third is returned, after 3 draws.
  - V2: it gives up after exactly 10 taken ids with "Could not mint an unused
    order id".
  - V3: a checkout after one collision gives 200, and Stripe and the row both
    carry the free id.
  - V4: when every draw collides, `POST` **throws** "Could not mint an unused
    order id", with 0 Stripe calls and 0 new rows. In Next, a thrown error is
    a bare 500 with an empty body (see Warnings).
- Static scope audit (regression P27): PR #31 adds exactly one new query with
  no scope predicate, `unusedOrderId`'s `SELECT 1 FROM orders WHERE id = ?`
  (orders.ts:269). It has to be global to detect collisions, and it returns no
  row data. The other three are the ones the #28 report listed.

### Layer 2: runtime

- All containers were `running` with `RestartCount=0` at the end, and each
  served `/` with 200 (R sections of both logs).
- The only error lines were the expected ones: the `[checkout] Stripe session
  create failed: ...` and `[checkout] could not save order ...` lines, the
  `[startup]` refusals, Next's "Request body exceeded 10MB" warning (B-R6),
  and `[Error: aborted] { code: 'ECONNRESET' }`. That last one is Next logging
  the uploads the harness abandoned on purpose: 3 on dv31-none and 1 on
  dv31-fake, matching the abandoned uploads.

### Layers 3 and 4: network and headless

- Repo assertions (`verify/smoke.yml`, `verify/assertions/home.yml`,
  `verify/assertions/reservations.yml`) against `dv31-none`:
  `{"PASS":62,"FAIL":0,"N/A":7,"SKIP":2}` (Q1 to Q73 in the regression log).
- Headless (U section, 390x844): the reservation and checkout inputs carry
  the claimed `maxLength` values; typing 150 characters keeps 100; a UI
  checkout while Stripe fails shows "The payment service is temporarily
  unavailable" with the page intact and no row; a UI checkout with Stripe up
  sends the browser to the session URL. That navigation was intercepted in
  Playwright and never reached Stripe.

### Layer 6: slow clients and the diagnostic run (not in the TOTALs)

`slow.mjs` against `dv31-ret` (`slow.log`, verbatim):

```
[5.2s] S4 with 150 open slow uploads, GET / x5: 200/115ms 200/23ms 200/14ms 200/14ms 200/12ms
[110.2s] S3 header trickle: closed (ECONNABORTED) after 110233 ms
[110.2s] S3 header trickle: closed (close) after 110233 ms
[329.4s] S1 body trickle (1 byte / 5 s, chunked): status=408 closedBy=server-end after 329364 ms
[329.4s] S2 body trickle (declared CL 5000, 1 byte / 5 s): status=408 closedBy=server-end after 329364 ms
[329.4s] S5 of 150 slow uploads still open at end: 150
```

So a trickled body is held for about 5.5 minutes until Node's default
`requestTimeout` answers 408, and trickled headers for about 110 s. 150 slow
uploads at once did not slow the server. S5 only means those sockets had not
yet reached their own 300 s limit when the probe stopped.

`diag.mjs` against `dv31-diag` (`diag.log`, verbatim). **This is the same
image with one compiled file changed**:
`.next/server/middleware-manifest.json`, whose matcher was changed from
`(?!_next\/static|...` to `(?!api\/|_next\/static|...`. It is not the PR's
code as shipped. It is here only to show where the defect is:

```
DIAG-1 never-ending chunked: 413 after 68 ms, 65554 bytes sent when the response arrived {"error":"Request body is too large"}
DIAG-2 Content-Length 1000000, no body: 413 after 11 ms
DIAG-3 Content-Length 1000000 streamed: 413, response after 1000000 bytes sent
DIAG-4 normal cookieless booking with the middleware skipped: 201 {"id":"HR-N78MR"}, route set hb_visitor itself: true
```

(An earlier DIAG-4 attempt picked a closed date and got 400; it was re-run on
an open date.)

### Layer 6: full check logs (verbatim)

Attack harness (`attack-final2.log`), run on freshly created containers.
Section key: C is the payment path (C12 is Stripe hanging), D is tipCents, E
is malformed carts, F is field limits and multibyte, B is byte caps over raw
sockets, U is headless Chromium, K is key material, R is runtime.

```

== C: checkout payment path, Stripe failure modes (fake Stripe in dv31-fake, reset listener in dv31-test) ==
PASS  C1a  Stripe unreachable, connection refused: 503 JSON with exactly the fixed message  [503 1114 ms {"error":"The payment service is temporarily unavailable, so your order was not ]
PASS  C1b  connection refused: NO order row written  [orders 20->20]
PASS  C1c  connection refused: response leaks no internals  [none]
PASS  C2a  Stripe connection reset mid-handshake (dv31-test listener): 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C2b  Stripe connection reset mid-handshake (dv31-test listener): Stripe was actually attempted, and NO order row was written  [stripe calls 0->3, orders 20->20]
PASS  C2c  Stripe connection reset mid-handshake (dv31-test listener): response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C3a  Stripe 400 invalid_request_error carrying a sentinel message: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C3b  Stripe 400 invalid_request_error carrying a sentinel message: Stripe was actually attempted, and NO order row was written  [stripe calls 0->1, orders 20->20]
PASS  C3c  Stripe 400 invalid_request_error carrying a sentinel message: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C4a  Stripe 500 api_error: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C4b  Stripe 500 api_error: Stripe was actually attempted, and NO order row was written  [stripe calls 1->4, orders 20->20]
PASS  C4c  Stripe 500 api_error: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C5a  Stripe 200 with a non-JSON body: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C5b  Stripe 200 with a non-JSON body: Stripe was actually attempted, and NO order row was written  [stripe calls 4->5, orders 20->20]
PASS  C5c  Stripe 200 with a non-JSON body: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C6a  Stripe session with url null: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C6b  Stripe session with url null: Stripe was actually attempted, and NO order row was written  [stripe calls 5->6, orders 20->20]
PASS  C6c  Stripe session with url null: response leaks no internals (sentinel, host, errno, key, stack)  [none]
INFO  checkout log lines: [checkout] Stripe session create failed: StripeConnectionError | [checkout] Stripe session create failed: StripeInvalidRequestError (amount_too_large) | [checkout] Stripe session create failed: StripeAPIError | [checkout] Stripe session create failed: Error
PASS  C7  server log lines for Stripe failures carry only the error type/code: no sentinel message, no key, no host  [6 lines]
PASS  C7b  the 400 case is logged with its Stripe code (StripeInvalidRequestError / invalid_request_error (amount_too_large))  []
INFO  harness: stale keep-alive socket on GET /, retried once
PASS  C8a  ok session: 200 with { url, orderId }, url is the session URL  [200 HB-QC5HC]
PASS  C8b  ok session: the order row did NOT exist while Stripe was being called (checked by the fake from the DB)  [rowDuringCall=false]
PASS  C8c  ok session: exactly one new row, pending, tagged with the caller visitor id, session id stored in the same insert  [pending sess=true]
PASS  C8d  ok session: client_reference_id, metadata[order_id], payment_intent_data[metadata][order_id] all equal the returned orderId  [HB-QC5HC]
PASS  C8e  ok session: success_url and cancel_url carry the same orderId  [/order/confirmation/HB-QC5HC?session_id={CHECKOUT_SESSION_ID}]
PASS  C8f  ok session: totals agree (row subtotal + tip = row total = sum of Stripe line items); tip sent as its own line  [1400+250=1650, stripe 1650]
PASS  C9a  insert fails after Stripe succeeded: JSON 500 with the fixed "could not be saved" message (not an empty 500)  [500 application/json {"error":"Your order could not be saved. Please try again."}]
PASS  C9b  insert fails: the squatting row is untouched (not overwritten by the visitor), and no second row appears  [{"n":"Squatter Row dv31","v":"dv31-squatter","s":"received","sid":null}]
PASS  C9c  insert fails: the response carries no session URL, so the orphan test session cannot be paid by this visitor  [{"error":"Your order could not be saved. Please try again."}]
PASS  C9d  insert fails: log names the order id and error class only (no customer name or phone)  [[checkout] could not save order HB-8HW3Z: SqliteError]
PASS  C10  slow Stripe (3 s): 200 and a row, nothing written before the session came back  [200 3024 ms]
PASS  C11  20 concurrent checkouts: 20 x 200, 20 distinct order ids, 20 rows each tagged with its own visitor, no row existed during any Stripe call  [20 ok, 20 ids, 20 rows]

== D: tipCents (fake Stripe in ok mode unless noted) ==
PASS  D1  negative tip (-500): coerced to 0, no Tip line sent to Stripe, total == subtotal (cannot lower the total)  [{"status":200,"row":{"s":1400,"t":0,"tot":1400,"ty":"integer"},"sentTip":null}]
PASS  D2  tip -0.4: 0, total == subtotal  [{"status":200,"row":{"s":1400,"t":0,"tot":1400,"ty":"integer"},"sentTip":null}]
PASS  D3  tip 1e400 (JSON Infinity): coerced to 0  [{"status":200,"row":{"s":1400,"t":0,"tot":1400,"ty":"integer"},"sentTip":null}]
INFO  D4 tip 1e20 with a Stripe that accepts anything: {"status":200,"row":{"s":1400,"t":100000000000000000000,"tot":100000000000000000000,"ty":"real"},"sentTip":"100000000000000000000"} (the app itself sets no upper bound)
PASS  D4  tip 1e20: the app forwards it to Stripe unbounded; only Stripe acceptance could store it (recorded, see D5)  [{"status":200,"row":{"s":1400,"t":100000000000000000000,"tot":100000000000000000000,"ty":"real"},"sentTip":"100000000000000000000"}]
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
PASS  D5  tip 1e20 when Stripe rejects the amount (as real Stripe does above 99999999): 503 and NO row  [{"status":503,"row":null,"sentTip":"100000000000000000000"}]
INFO  D6 tip 2^53+1: {"status":200,"row":{"s":1400,"t":9007199254740992,"tot":9007199254742392,"ty":"integer"},"sentTip":"9007199254740992"}
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  D7 quirks: "abc"->0 true->1 [5]->5 " 7 "->7 0.5->1
PASS  D8  across every tip tried, no stored order has a negative tip or a total below its subtotal  [0 bad rows]
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  D9 harbor-smash-burger with "bacon" x200 in extras: 200, subtotal 61700 vs 1700 plain (pre-existing: duplicate add-on ids are each charged)
PASS  D9  duplicate add-on ids can only raise the price (never below the plain item)  [61700 >= 1700]

== E: malformed carts and bodies (looking for any bare or non-JSON 500) ==
INFO  E statuses: lines [null]:400, lines [1]:400, lines ["x"]:400, lines [[]]:400, slug object:400, quantity "1":200, quantity 1.5:400, quantity -1:400, quantity 13:400, selections "abc":400, selections 5:200, selections []:200, selections null:200, selections __proto__:400, selections constructor:400, burger bun array:400, burger bun null:400, burger extras object:400, burger extras [null]:400, burger extras "bacon":200, lines array-like object:400, 51 lines:400, 50 lines:200, fulfillment object:400, customerName object:400, customerName array:400, customerPhone number:400, body null:400, body []:400, body "str":400, body 123:400, body true:400, empty body:400, huge slug 30 KB:400, unicode slug:400
PASS  E1  35 malformed carts/bodies against a working Stripe: no 5xx, every response is JSON  [none]
PASS  E2  51 lines -> 400 and 50 lines accepted  [51 lines:400,50 lines:200]

== F: field limits after trim, UTF-16 units vs UTF-8 bytes, non-string values (reservations on dv31-none, checkout on dv31-fake) ==
PASS  F-name  reservation name: 100 ASCII accepted and stored whole; 101 -> 400 "Name must be at most 100 characters", nothing stored  [201/400]
PASS  F-phone  reservation phone: 32 ASCII accepted and stored whole; 33 -> 400 "Phone must be at most 32 characters", nothing stored  [201/400]
PASS  F-email  reservation email: 254 ASCII accepted and stored whole; 255 -> 400 "Email must be at most 254 characters", nothing stored  [201/400]
PASS  F-notes  reservation notes: 500 ASCII accepted and stored whole; 501 -> 400 "Notes must be at most 500 characters", nothing stored  [201/400]
PASS  F-mb1  reservation name: 100 x e-acute (2 bytes each) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb2  reservation name: 50 emoji (100 UTF-16 units, 200 bytes) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb3  reservation name: 51 emoji (102 units) -> 400  [400 units=102 bytes=204]
PASS  F-mb4  reservation name: 100 CJK (300 bytes) accepted  [201 units=100 bytes=300]
PASS  F-mb5  reservation name: 101 CJK -> 400  [400 units=101 bytes=303]
PASS  F-mb6  reservation name: 99 ASCII + 1 emoji (101 units, what maxLength also blocks) -> 400  [400 units=101 bytes=103]
PASS  F-mb7  reservation name: 50 decomposed e + combining accent (100 units) accepted  [201 units=100 bytes=150]
PASS  F-worst  reservation: every field at its limit with the worst-case JSON encoding (\u escapes) is 5409 bytes, under 8192, and is accepted and stored intact  [201 5409 bytes]
PASS  F-trim  reservation name: 100 chars wrapped in ASCII and ideographic whitespace accepted, stored trimmed at 100  [201]
PASS  F-trim2  reservation name of only whitespace -> 400 (required), nothing stored  [400 {"error":"name, phone, partySize, date, and time are require]
PASS  F-types  reservation: non-string name/phone/email/notes -> 400 "<Field> must be text", nothing stored (no "[object Object]" rows)  [name=123:400:Name must be text | name={"a":1}:400:Name must be text | phone=["555"]:400:Phone must be text | email=true:400:Email must be text | notes={"toStrin]
INFO  F-lone lone high surrogate in name: 201 stored="Lone ��� surrogate 803cf9"
PASS  F-lone  reservation name with a lone UTF-16 surrogate: handled (201 or 400), not a 500  [201]
PASS  F-ck-customerName  checkout customerName: 50 emoji (100 units) accepted and stored intact; 101 units -> 400 "Name must be at most 100 characters" with NO Stripe call and no row  [400/200 stripe 48->48]
PASS  F-ck-customerPhone  checkout customerPhone: 16 emoji (32 units) accepted and stored intact; 33 units -> 400 "Phone must be at most 32 characters" with NO Stripe call and no row  [400/200 stripe 49->49]
PASS  F-ck-customerEmail  checkout customerEmail: 127 emoji (254 units) accepted and stored intact; 255 units -> 400 "Email must be at most 254 characters" with NO Stripe call and no row  [400/200 stripe 50->50]
PASS  F-ck-deliveryAddress  checkout deliveryAddress: 150 emoji (300 units) accepted and stored intact; 301 units -> 400 "Delivery address must be at most 300 characters" with NO Stripe call and no row  [400/200 stripe 51->51]
PASS  F-ck-types  checkout: object customerName -> 400 "Name must be text", no Stripe call  [400]

== B: byte caps on the running production server (raw sockets, dv31-none and dv31-fake) ==
PASS  B-res-1  /api/reservations: exactly 8192 bytes with Content-Length handled normally (201), 8193 -> 413 {"error":"Request body is too large"}  [201/413 {"error":"Request body is too large"}]
PASS  B-res-2  /api/reservations: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 201 then 413  [201/413]
PASS  B-res-3  /api/reservations: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [26->28]
PASS  B-ck-1  /api/checkout: exactly 32768 bytes with Content-Length handled normally (200), 32769 -> 413 {"error":"Request body is too large"}  [200/413 {"error":"Request body is too large"}]
PASS  B-ck-2  /api/checkout: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 200 then 413  [200/413]
PASS  B-ck-3  /api/checkout: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [65->67]
PASS  B-admO-1  /api/admin/orders/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admO-2  /api/admin/orders/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-admR-1  /api/admin/reservations/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admR-2  /api/admin/reservations/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-portal-1  /api/auth/portal-handoff: exactly 16384 bytes with Content-Length handled normally (400/401/403/503), 16385 -> 413 {"ok":false,"error":"payload_too_large"}  [401/413 {"ok":false,"error":"payload_too_large"}]
PASS  B-portal-2  /api/auth/portal-handoff: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400/401/403/503 then 413  [401/413]
INFO  B-mb bodies 8192 / 8193 bytes, notes 2698 UTF-16 units of CJK
PASS  B-mb  reservation notes of CJK: 8192-byte body in 7-byte chunks (splitting characters) -> not 413; 8193 bytes -> 413  [400 {"error":"Notes must be at most 500 characters"} / 413]
PASS  B-under  understated Content-Length (12) with a 40 KB body: server reads 12 bytes -> 400, the rest is not a valid request, nothing stored, server fine  [400 ]
PASS  B-over  overstated Content-Length (5000) with a short valid body, client gives up: no response, nothing stored, server fine  [null client-timeout]
PASS  B-gzip  gzip "bomb" (4908 bytes on the wire, 5 MB inflated) -> 400, not inflated, nothing stored  [400]
INFO  B-te-cl Content-Length together with Transfer-Encoding: 400
PASS  B-1mb  the #28 repro over chunked transfer: 1 MB name -> 413 JSON, nothing stored  [413]
FAIL  B-R1  READ-TIME CAP: a chunked upload that passes 8 KB and keeps going gets its 413 while still uploading (claim: "abandoned as soon as the running total passes the cap")  [no response after 15009 ms and 184570 bytes sent (client-timeout)]
FAIL  B-R2  READ-TIME CAP: a declared Content-Length of 1,000,000 is refused up front, before the body is sent (claim: "refused up front (413)")  [no response after 10031 ms (client-timeout)]
FAIL  B-R3  READ-TIME CAP: with Content-Length 1,000,000 streamed, the 413 arrives before the whole megabyte has been sent  [413 after 1000000 of 1000000 bytes]
FAIL  B-R4  READ-TIME CAP (checkout, 32 KB): a never-ending chunked upload gets a 413 while still uploading  [no response after 15004 ms and 184578 bytes (client-timeout)]
PASS  B-R5  after B-R1..B-R4 nothing was stored and the server still answers  []
INFO  B-R6 12 MB chunked: 413 after 1380 ms, first response byte after 12584666 bytes sent; server log: Request body exceeded 10MB for /api/reservations. Only the first 10MB will be available unless configured. See https://nextjs.org/docs/app/api-referen
PASS  B-R6  12 MB chunked upload still ends in 413 with nothing stored (outcome), and Next logs its 10 MB middleware body-clone warning (mechanism)  [413]
INFO  B-R7 20 concurrent 9 MB chunked uploads: statuses 413; dv31-none memory 105.3MiB before, peak 388.6MiB during
PASS  B-R7  20 concurrent 9 MB uploads all end in 413 and the server survives (outcome)  [413]

== U: headless Chromium (390x844): form limits and the 503 message ==
PASS  U1  /reservations inputs carry maxLength name 100, phone 32, email 254, notes 500  [[100,32,254,500]]
PASS  U2  typing 150 characters into the reservation name keeps 100  [100]
PASS  U3  /order checkout inputs carry maxLength name 100, phone 32, email 254, address 300  [text:100,tel:32,email:254,radio:-1,radio:-1,text:300]
PASS  U4  UI checkout while Stripe fails: /api/checkout 503, the "payment service is temporarily unavailable" message is shown, page intact, no row  [503 rows 67->67]
PASS  U5  UI checkout with Stripe up: 200, the browser is sent to the session URL (intercepted, never reaches Stripe), one pending row  [200 https://checkout.stripe.com/c/pay/cs_test_dv31_f5be4b89025c5]
PASS  U6  no uncaught page errors in the UI run  []

== C12: Stripe accepts the TLS connection and never answers (timeout path) ==
INFO  C12 hang: 503 after 241.0 s, 3 Stripe attempt(s)
PASS  C12  Stripe that never answers: checkout still ends in the JSON 503 with no row (however long it takes)  [503 after 241.0 s, 3 attempts]

== K: key material ==
PASS  K1  the fake sk_test_ keys never appear in either container log  [fake:clean test:clean]

== R: runtime ==
INFO  R-none request-aborted log lines from the harness's deliberately abandoned uploads: 3
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-test request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-fake request-aborted log lines from the harness's deliberately abandoned uploads: 1
PASS  R-fake  fake: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 93/97 passed  ({"PASS":93,"FAIL":4})
```

Regression harness (`regress-final3.log`): PR #28's harness, renamed to the
dv31 containers and run again on freshly created containers. Three checks
were changed on purpose, because PR #31 changes the behaviour they pinned:
K-test-2 now requires a 503 and **no** row (it used to require the pending
row); the reconcile-ordering probes K-test-3/4 use a pending row inserted
directly, since checkout can no longer leave one behind; and E9 now requires
413 with nothing stored (E9b) instead of accepting 201. P27 expects PR #31's
one new existence probe. Everything else is unchanged.

```

== P: per-visitor scope (container none, no Stripe key) ==
PASS  P1  A first request: 200 and hb_visitor Set-Cookie  [200]
PASS  P2  cookie flags: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure  [hb_visitor=<v4>; Path=/; Expires=Mon, 19 Oct 2026 08:19:39 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax]
PASS  P3  A id is a lowercase v4 UUID  [v4]
PASS  P4  A second request keeps its id (no new hb_visitor Set-Cookie)  [0 set-cookie]
PASS  P5  B gets its own distinct valid id  [distinct]
PASS  P6  A creates a reservation through the real API -> 201  [201 HR-YU2BY]
PASS  P7  A reservation row is tagged with A visitor id  [tag==A]
PASS  P8  B creates its own reservation -> 201, tagged B  [201 HR-XBMJQ]
PASS  P9  cookieless create -> 201, sets HttpOnly SameSite=Lax cookie, row tagged with that minted id  [201]
INFO  A order HB-A742D (received), HB-C742D (completed); B order HB-B742D; legacy HB-LGCYN / RS-LGCYN (visitor_id NULL); A res HR-YU2BY; B res HR-XBMJQ
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
PASS  P23  A: admin POST advance on own order -> 200 preparing  [{"id":"HB-A742D","status":"preparing","statusLabel":"Preparing"}]
PASS  P24  A: admin POST seat own booking -> 200 seated  [{"id":"HR-YU2BY","status":"seated"}]
PASS  P25  B: admin POST on a seed order -> 200 (staff demo still works)  [{"id":"HB-AE4K3","status":"preparing","statusLabel":"Preparing"}]
PASS  P26  every row written in this run is tagged: the only NULL rows are the 2 deliberate legacy inserts  [orders NULL=1 reservations NULL=1]
INFO  static: SELECT ... FROM orders|reservations without the scope predicate: src\lib\orders.ts:269, src\lib\orders.ts:285, src\lib\orders.ts:305, src\lib\reservations.ts:42
PASS  P27  static: only 4 unscoped reads remain (getOrderUnscoped, getOrderByCheckoutSession, slot counts, and the PR #31 unusedOrderId existence probe that returns no row data)  [src\lib\orders.ts:269 src\lib\orders.ts:285 src\lib\orders.ts:305 src\lib\reservations.ts:42]

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
PASS  K-test-1  test (fake sk_test_): checkout passes the guard and DOES try Stripe (blocked at the pinned host)  [status 503, hits 0->3]
INFO  K-test checkout response: 503 {"error":"The payment service is temporarily unavailable, so your order was not placed. Please try again in a moment."}
PASS  K-test-2  test (PR #31): blocked Stripe -> 503 JSON and no order row written (was: pending row left behind)  [503 orders 20->20]
INFO  harness: stale keep-alive socket on GET /, retried once
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
INFO  inserted per table: V25A (app format, -25h), V25B (ISO, -25h), V23 (-23h), S100 (seed, -100h), N100 (NULL, -100h); created_at V25A=2026-09-18 07:20:27 V25B=2026-09-18T07:20:28.248Z
PASS  T1  hourly gate: 6 requests after insert do not purge (boot run already happened this hour); all 5+5 rows present  [5/5]
PASS  T2  after restart (boot purge): orders -25h rows gone in both timestamp formats; -23h, seed -100h, NULL -100h kept  [N100,S100,V23]
PASS  T3  after restart: reservations same outcome  [N100,S100,V23]
PASS  T4  fresh visitor booking made minutes ago survives  [HR-H44P7]
PASS  T5  boot log: "[retention] deleted 2 orders and 2 reservations"  [[retention] deleted 2 orders and 2 reservations created by visitors before 2026-09-18T08:20:40.295Z]
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
PASS  E9  reservations (PR #31): 1 MB name -> 413 (was 201 stored)  [413 {"error":"Request body is too large"}]
PASS  E9b  reservations: nothing stored for the 1 MB name  [19]
PASS  E10  reservations: HTML/unicode/apostrophes in name -> 201  [201 {"id":"HR-4PC9A"}]
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
PASS  E21  owner illegal transition completed -> cancelled -> 409 (not 404, not 500)  [409 {"error":"Reservation HR-YU2BY cannot move from \"completed\" to \"cancelled\""}]
PASS  E22  checkout 1 MB body with no key -> 503, no crash  [503]
PASS  E23  4 KB cookie value -> 200 and replaced by a fresh v4 id  [200]

== H: headless Chromium (390x844, container none) ==
PASS  H0  browser A holds hb_visitor: httpOnly, secure, sameSite Lax, v4  [true/true/Lax]
PASS  H0b  browser A keeps the same id across navigations (cookie sent back over http://127.0.0.1)  []
PASS  H1  /reservations shows the demo notice (visible)  []
PASS  H2  /order checkout form (cart with 1 item) shows the demo notice (visible)  []
INFO  H2b checkout submit from UI: 503
PASS  H2b  UI checkout submit with no key -> /api/checkout 503 and the not-configured message is shown in the page, no crash  [503]
PASS  H3  browser A books through the UI and lands on its confirmation with its name  [/reservations/HR-WTGMF]
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
PASS  Q51  assertions/home.yml / lcp_under_ms 1500 (local origin)  [120 ms]
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

TOTAL 221/221 passed  ({"PASS":221,"FAIL":0,"N/A":7,"SKIP":2})
```

Combined TOTAL: **314 of 318 checks passed** (attack 93/97, regression
221/221), plus 7 N/A, 2 SKIP and 4 of 4 in-process probes. Of the 4 FAILs, 3
stand (B-R1, B-R2, B-R4) and 1 is withdrawn (B-R3).

Curated edge categories covered: missing and malformed input (35 cart and
body shapes, non-string fields, empty and non-object bodies), max inputs
(every field at max and max+1, exact byte caps, 1 MB, 9 MB, 12 MB, a
never-ending stream), special characters (emoji, CJK, combining marks, lone
surrogates, ideographic whitespace, gzip bodies), race conditions (20
concurrent checkouts, the insert-time id collision, 20 concurrent same-slot
bookings), slow network (slow Stripe, hanging Stripe, trickled headers and
bodies, 150 slow uploads) and denied permissions (the whole PR #28 X matrix).

## 3. Theater Check

| PR #31 claimed | Verification found | Verdict |
|---|---|---|
| Stripe unreachable or failing gives a JSON 503 with a fixed message | refused (C1), reset (C2), 400 with a sentinel (C3), 500 (C4), non-JSON 200 (C5), no URL (C6) and a hang (C12, after 241 s): every one is 503 with exactly `{"error":"The payment service is temporarily unavailable, ..."}` and JSON content-type; the UI shows it (U4) | CONFIRMED |
| No order row is written when Stripe fails | 0 new rows in all 7 failure modes (C1b to C6b, C12, U4); regression K-test-2 | CONFIRMED |
| The row is written only after Stripe returns a session with a URL | the fake Stripe checked the DB during each call: the row was absent every time (C8b, C10, 20 of 20 in C11); a session with no URL leaves no row (C6); exactly one pending, tagged row with the session id appears afterwards (C8c) | CONFIRMED |
| The client never sees error internals; the log carries only the type or code | 0 leak markers in every 503 body (C*c); log lines are `StripeConnectionError`, `StripeInvalidRequestError (amount_too_large)`, `StripeAPIError`, `Error`, with no sentinel, key or host (C7, C7b); fake keys never in the logs (K1) | CONFIRMED |
| The session carries the pre-minted id (client reference, metadata, URLs) | all four carry the returned `orderId`, and the totals match the line items (C8d to C8f) | CONFIRMED |
| `unusedOrderId` checks that the id is free | skips taken ids and gives up after 10 (V1 to V3) | CONFIRMED; the give-up path is a bare 500 (V4, Warnings) |
| Insert fails after Stripe succeeded: JSON 500, and the test session expires on its own | a real concurrent-writer collision gives the JSON 500 "could not be saved", the squatting row is untouched, no session URL is returned, and the log carries the id and `SqliteError` only (C9a to C9d). "Expires on its own" is Stripe behaviour that cannot be observed without a Stripe account | CONFIRMED (JSON 500); expiry UNVERIFIED |
| `readJsonBody` refuses a declared Content-Length over the cap up front | on the running server, `Content-Length: 1000000` with no body got **no response in 10 s** (B-R2). It does work in-process (unit test) and when the middleware skips `/api/` (DIAG-2, 11 ms) | **THEATER on the real server** |
| It counts the stream while reading and cuts a chunked or understated upload off with 413 | the 413 itself: CONFIRMED on every route over Content-Length and chunked transfer, at the exact byte (B-*-1/2, B-mb, B-1mb). "Cut off": a never-ending chunked upload got **no response in 15 s** on reservations (B-R1) and checkout (B-R4); a 12 MB upload was answered only after all 12.5 MB were sent, with Next's own log saying it buffered 10 MB (B-R6); 20 concurrent 9 MB uploads took the container from 105 MiB to a peak of 389 MiB (B-R7) | **THEATER** (mechanism); outcome CONFIRMED |
| Caps: checkout 32 KB, reservations 8 KB, admin actions 1 KB, portal 16 KB; the portal keeps `{ ok:false, error:"payload_too_large" }` | exact cap accepted and cap+1 refused, over Content-Length and chunked, on all five endpoints (B-*-1/2) | CONFIRMED |
| Field limits after trim: name 100, phone 32, email 254, address 300, notes 500 | max accepted and stored whole, max+1 is 400 with the stated message, on reservations and checkout; whitespace trimmed first (F-*, F-trim) | CONFIRMED |
| Limits count UTF-16 units, the byte cap counts UTF-8 bytes | emoji, CJK and combining marks behave by UTF-16 units (F-mb1 to F-mb7); an 8192-byte CJK body in 7-byte chunks is not 413, and 8193 is (B-mb); the worst-case legal reservation is 5409 bytes, so a legal form can never hit the byte cap (F-worst) | CONFIRMED |
| Non-strings refused instead of stored as "[object Object]" | 400 "<Field> must be text" for numbers, objects, arrays, booleans; 0 rows; no `[object Object]` anywhere (F-types, F-ck-types) | CONFIRMED |
| Cart capped at 50 lines | 51 is 400, 50 is 200 (E2) | CONFIRMED |
| Over-cap requests get 413 or 400 and nothing is stored | row counts unchanged across every over-cap, understated, overstated and gzip request (B-*-3, B-under, B-over, B-gzip, B-R5, B-R6) | CONFIRMED |
| Forms mirror the limits with maxLength and show the server's error text | U1 to U4 | CONFIRMED |
| Stripe webhook untouched | empty diff on `src/app/api/webhooks` | CONFIRMED |
| 123/123 tests, tsc clean, lint 0 errors / 3 warnings, build succeeds; negative control 11 of 13 fail on main | reproduced exactly (Layer 1) | CONFIRMED |
| (from #28, regression) visitor scoping, Stripe key guard, retention, migration | 221 of 221 (regression log) | CONFIRMED |

## 4. Blockers

### B1. The byte cap does not act while reading on the production server (claim 2)

**What:** `src/middleware.ts` matches every path except static assets, so it
runs on `POST /api/checkout`, `/api/reservations`, `/api/admin/*` and
`/api/auth/portal-handoff`. When middleware runs on a request with a body,
Next 15.5 (`next/dist/server/body-streams.js`, `getCloneableBody`) reads the
entire incoming body. It keeps up to `middlewareClientMaxBodySize` (default
10 MB) in memory and discards the rest. `sandbox.js` then `await`s
`finalize()`, which waits for the request to **end** before the route handler
runs. So `readJsonBody`'s Content-Length check and its streaming counter only
ever see a finished (and at most 10 MB) body.

**Effect:**
- the 413 comes only after the whole upload;
- a never-ending or slow upload gets no answer until Node's 300 s
  `requestTimeout` (S1: 408 after 329 s);
- each in-flight upload can pin up to 10 MB (B-R7).

Nothing is ever stored, so this is a resource and honesty problem, not a
data one. It is **not a regression**: `main` has the same middleware. But it
is the core mechanism claim of D-017 and of the PR, and the unit tests cannot
see it because they call the handler directly, without Next's server.

**Recommended fix** (proven by DIAG-1/2/4):
- Exclude `/api/` from the middleware matcher, for example by adding `api/` to
  the negative lookahead. The write routes already mint and set `hb_visitor`
  themselves through `visitorIdForWrite` (DIAG-4: 201 plus the cookie). The
  admin POSTs fall back to seed-only scope without a cookie. GET routes under
  `/api/` keep working the same way, because they read the cookie the browser
  already holds.
- If you want defence in depth, also set
  `experimental.middlewareClientMaxBodySize` low (for example `64kb`) in
  `next.config.mjs`.
- Add one test that runs against a real `next start` server: a chunked upload
  that never ends must get 413 within a second.
- Update D-017 and the PR text to say what the cap does once this lands.

**Agent tier:** Tier-2 implementer (Sonnet-class). It is a small matcher and
config change plus a server-level test. The PR stays Tier-3 for the merge,
and it needs a re-verify of B-R1 to B-R7 on the new head.

## 5. Warnings

### CI "Deep Verify" is green on this PR without any report for it (process)

`gh pr checks 31` shows "Deep Verify (tier-3 PRs only): pass". That is the
old gate on `main`, which accepts "Overall: PASS" from **any** file in
`verify/reports/`, here the PR #25 report. The per-PR gate that checks the PR
number and `Tested-SHA` lives on the unmerged branch
`origin/chore/deep-gate-per-pr`. **This FAIL report does not turn the current
check red.** Do not merge on CI alone. Recommend merging the per-PR gate
chore before PR #31 (Tier-2 implementer, Drew merges).

### Stripe timeouts are longer than the proxy's (payment UX)

With a Stripe that accepts the connection and never answers, the app's 503
came after **241 s** (3 attempts of the SDK default 80 s; C12).
`cloudflare-config/nginx/conf.d/harborbistro.conf` sets
`proxy_read_timeout 60s`, so a real visitor would get the proxy's 504 at 60 s,
not the friendly 503. The order form catches that and shows "Could not reach
the payment service". Still no row, so it is safe. But a Stripe call that
succeeds between 60 s and 240 s would leave a pending, tagged row that the
visitor never saw (purged after 24 h). Recommend
`new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 })` in
`src/lib/stripe.ts` (Tier-2 implementer).

### `unusedOrderId` exhaustion is a bare 500 (minor)

`unusedOrderId()` is called outside the try/catch, so its "Could not mint"
error (or any SQLite error there) becomes Next's empty 500 (V4). There is no
row and no Stripe call, and the odds of it happening are negligible (10
straight collisions in a space of about 28.6 million ids). Recommend moving
the call inside a try that returns the same JSON 500 as the insert path
(Tier-3 is overkill; Tier-1/2 implementer).

### tipCents has no upper bound and loose typing (pre-existing, point (d))

- A negative tip cannot lower the total: -500, -0.4 and `1e400` all become 0,
  no Tip line is sent, and across every tip tried no row has a negative tip or
  a total below its subtotal (D1 to D3, D8).
- There is **no upper bound**: 1e20 is forwarded to Stripe as the string
  `100000000000000000000`. With a Stripe that accepts anything it was stored
  as a REAL `tip_cents` (D4). With Stripe rejecting it, which is what real
  Stripe does above its maximum amount, the result is 503 and no row (D5). So
  in practice Stripe is the only bound.
- 2^53+1 loses precision (D6), and loose coercion accepts `true` (1 cent),
  `[5]` and `" 7 "` (D7).
- No overflow can make the total negative.

Recommend accepting only a non-negative integer `number` with a sane cap, for
example no more than the subtotal or 100000 cents, and returning 400 above it
(Tier-2 implementer). Not introduced by this PR.

### Duplicate add-on ids are each charged (pre-existing)

`extras: ["bacon" x 200]` on the smash burger priced the line at $617.00
against $17.00 plain (D9). It can only raise the price the visitor pays
themselves, and the 32 KB cap bounds it now. Recommend de-duplicating
multi-select ids in `normalizeSelections` (Tier-1/2 implementer).

### Deployment note: the proxy already caps bodies (unverified live)

The harborbistro vhost sets no `client_max_body_size`, so nginx's 1 MB
default applies, along with its default request buffering and
`client_body_timeout`. In the deployed topology, oversized uploads should be
stopped at the proxy before they reach Next. This lowers the real-world
impact of B1. It was read from config only; the live proxy was not probed
(out of bounds for this run).

### Minor

- A lone UTF-16 surrogate in a name is stored as replacement characters
  (F-lone: 201, no 500). Fine for a demo.
- The address limit is enforced even for pickup orders. The form cannot send
  more than 300 characters, so this is only visible to API callers.
- An understated Content-Length is caught by HTTP framing (Node reads that
  many bytes, JSON fails, 400; B-under), not by the byte counter. The unit
  test's "understated Content-Length returns 413" only holds in-process.
- The fixed 503 message says "payment service" for a Stripe-side 400 too
  (C3), for example amount too large. That is accurate enough for a visitor;
  the log has the real code.

## 6. Coverage gaps (stated so this report is not overclaimed)

- **Layer 5 (headed Chrome) was not run** (browser possibly in use by other
  agents). Headless Chromium covered the UI flows.
- **Real Stripe never ran.** The success path, the 4xx/5xx paths and the hang
  were driven by a fake Stripe trusted through `NODE_EXTRA_CA_CERTS`, with
  real `stripe@22.2.1` SDK code in between. Real Stripe's error shapes, its
  amount limit, session expiry and the webhook were not exercised.
- The live proxy's body limits and timeouts were read from config, not
  tested.
- The recommended fix was tested only as a patched compiled matcher in a
  throwaway container (dv31-diag), not as source.
- axe (2 assertions) skipped, HSTS (7) edge-only, Chromium only, no
  adversarial generator.

## 7. Harness corrections (earlier runs)

Recorded so the clean totals above are auditable:

- **B-R3 is withdrawn.** The diagnostic container, where the cap provably
  acts mid-stream (DIAG-1, DIAG-2), gives the same result (DIAG-3): the
  client pushes 1 MB into local socket buffers before it reads the 413. So
  the check cannot tell a working cap from a broken one. The verdict rests on
  B-R1, B-R2 and B-R4, with B-R6 and B-R7 as mechanism evidence.
- Attack runs 1 to 3: a stale keep-alive socket (the server's
  `Keep-Alive: timeout=5`) crashed the harness. The client now retries once
  on `UND_ERR_SOCKET`, and each retry is logged as an INFO line. The C7b regex
  expected `invalid_request_error`, but the app logs the SDK class name
  (`StripeInvalidRequestError`), which still carries the Stripe code. U5 read
  the response body after the page had already navigated away. C7 and C9d
  counted log lines left by earlier runs in the same container. The R checks
  flagged Next's `aborted` log lines from uploads the harness abandoned on
  purpose; these are now counted as INFO.
- Regression run 1: stale keep-alive crash (same fix). P27 expected 3
  unscoped queries and PR #31 adds a fourth (reviewed above). Run 2: the
  retention check used `id LIKE 'HB-T%'`, and this image's seed happens to
  include the seed order `HB-THQQF` (visitor `seed`). Retention kept it, which
  is correct, but the check counted it. The query now lists the probe ids
  exactly.
- The final attack run and the final regression run each started on freshly
  created containers.

## 8. Cleanup

All `dv31-*` containers (including `dv31-diag`) and the
`demo-harborbistro:dv31` image were removed after the run. The temporary
npmrc was deleted right after the build. The temporary in-process test file
and the temporary swap of `route.ts` for the negative control were removed
from the worktree before this commit. This report is the only file committed.
