# Deep Verify: PR #25 webhook fail-closed (2026-09-18)

Overall: PASS

Two assertion FAILs were recorded. Both are one stale selector in the verify
spec, the same on `main`, and not caused by this PR (see "Pre-existing assertion
drift" below). Coverage gaps are listed at the end so this PASS does not claim
more than it shows.

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-harborbistro` PR #25, branch
  `fix/webhook-fail-closed`, code under test at `dee0ca7`. This report is
  committed as a child of that commit and changes only `verify/reports/`.
- **Tier-3 surface:** `order-checkout` (`verify/tier_map.yml`). The PR changes
  `src/app/api/webhooks/stripe/route.ts` and adds tests and docs. It does not
  touch any page or `/api/checkout`.
- **Mode:** deep (`paradigm-verify`), layers 1 to 6 plus the curated edge sweep.
  The adversarial generator was not run.
- **Run by:** a Claude Code agent (Opus 5), not a human, on DREWSPC.
- **Environment:** a Docker image built locally from the PR head (`docker build`
  with the npmrc build secret). Two throwaway containers were started from it:
  - **A**, `127.0.0.1:18204`: the prod env file, with `STRIPE_WEBHOOK_SECRET`
    **unset**. This matches production today.
  - **B**, `127.0.0.1:18205`: the prod env file plus a throwaway local
    `STRIPE_WEBHOOK_SECRET`, generated for this run and never printed.
  - Both containers had `STRIPE_SECRET_KEY` set to empty, so no code path could
    call the Stripe API. Signatures were built locally with
    `Stripe.webhooks.generateTestHeaderString`.
  - The public URL, the live `demo-harborbistro` container and `C:\dev\_deploy`
    were not touched.

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| smoke | PASS | Layer 1 and 2 results below; container A and B `GET /` returned 200 |
| navigation | PASS | Headed: clicked the hero "Reserve a Table" CTA and landed on `/reservations`; drove menu item, cart drawer, `/order` |
| data_crud | PASS | Webhook sweep B6 to B17 (DB state checked by SQL after each call); headed pending to confirmed transition |
| error_handling | PASS | 503 with no secret, 400 on every bad signature, 400 (not 500) on a signed non-JSON body; checkout degrades to a clear message without a key |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge, so a local origin cannot show it (7 assertions). CI Quick Verify checks it against the live deploy |
| performance | PASS (local) | home LCP 64 ms at the local origin on a desktop CPU. This does not stand in for a mobile number from the public edge |
| accessibility | SKIP | `axe_no_critical` (2 assertions): axe-core is not in the harness. This PR changes no markup |
| mobile_responsive | PASS (partial) | Headless ran at a 390x844 viewport for every page surface |
| edge_cases | PASS | 24 of 24 checks (section 3) |
| auth_lifecycle | SKIP | This PR does not touch auth |
| visual_regression | SKIP | No baseline exists; this PR changes no UI |
| cross_browser | SKIP | Chromium only (headless Playwright plus headed Chrome) |

### Layer 1: code (at `dee0ca7`)

- `npx vitest run`: 7 files, 51 of 51 tests passed. That includes 11 new webhook
  route tests. 6 of those 11 fail against the old route.
- `npx tsc --noEmit`: exit 0.
- `npx next build`: exit 0.
- `npm run lint`: **red, but not because of this PR.** ESLint 10 no longer
  accepts the `.eslintrc.json` options: "Invalid Options: Unknown options:
  useEslintrc, extensions, resolvePluginsRelativeTo, rulePaths, ignorePath,
  reportUnusedDisableDirectives". Out of scope here; fixing it needs its own
  chore (`npx @next/codemod@canary next-lint-to-eslint-cli .`).

### Layer 2: runtime

- Both containers were `running` with `RestartCount=0` after every sweep. Next
  15.5.25 reported "Ready" in about 55 ms.
- Container A logged exactly one line across more than 6 rejected requests:
  `[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set; rejecting all webhook events (503). Orders still reconcile on the confirmation page.`
- Container B logged no errors and no warnings after the full sweep, including
  a 25-way race and two 1 MB bodies.

### Layers 3 and 4: network and headless (repo's own assertions, container B)

These are the repo's own assertions from `verify/smoke.yml`,
`verify/assertions/home.yml` and `verify/assertions/reservations.yml`. They ran
in headless Chromium at 390x844, with the console listener attached before
navigation.

Tally: `{"PASS":62,"FAIL":2,"N/A":7,"SKIP":2}`

- FAIL (2): `home selector_present "a[href='/reserve']"`, once from smoke.yml
  and once from assertions/home.yml. This is assertion drift that predates the
  PR (see below).
- N/A (7): `Strict-Transport-Security` header_present, which is edge-only.
- SKIP (2): `axe_no_critical`.
- Otherwise every other text, selector, status and JSON-path assertion passed,
  including:
  - `/api/reservations?date=2026-07-07` returned `isClosed=false`;
  - `?date=2026-07-06` returned `isClosed=true`;
  - `$.slots` was an array of 11;
  - `no_console_errors` held on home and reservations.

### Layer 5: headed (real Chrome through the Claude-in-Chrome extension)

The headed layer drove real Chrome through the Claude-in-Chrome extension
(`list_connected_browsers` showed one local Windows browser). The computer-use
MCP was not available, so screenshots came from the extension.

1. A pending order `HB-HEADED1` was seeded in container B.
   `/order/confirmation/HB-HEADED1` showed "Payment not completed. ... Order
   code -- Awaiting Payment".
2. A forged, unsigned `checkout.session.completed` for that order was sent to B:
   `HTTP 400 {"error":"Missing stripe-signature header"}`. On reload the page
   still showed "Payment not completed".
3. The same event, signed locally, was sent to B:
   `HTTP 200 {"received":true,"handled":true}`. On reload the page showed
   "Order confirmed. We are getting it ready for pickup." with the tracker on
   Received and "Order code -- Received".
4. Home: the hero "Reserve a Table" link (`href="/reservations"`) was clicked and
   the browser landed on `/reservations`. The form rendered with all fields and
   11 time slots.
5. From `/menu/harbor-smash-burger`, "Add to Cart" was clicked. The drawer
   opened with the item at $17. Clicking Checkout went to `/order`. Name and
   phone were filled with test data and "Pay $20.06" was clicked. The page
   showed "Online payment is not configured in this environment. Set
   STRIPE_SECRET_KEY (test mode) to enable checkout." No order row was created
   (0 rows for that customer name), which matches the `/api/checkout` 503 path.
6. `read_console_messages` reported no errors. It was attached after the page
   loaded, so the stronger console evidence is the headless run above.
7. Tooling notes:
   - Two `Page.captureScreenshot` calls timed out right after a navigation and
     succeeded on retry. Page text read fine in both cases.
   - One extension click by element ref did not add to the cart. The same click
     by coordinates worked. These are harness artifacts, not app defects.

### Layer 6: edge cases (curated sweep, webhook surface)

Container A has no secret; container B has the local secret. After every call
the order state was read back from SQLite inside the container.

```
PASS  A1  forged unsigned completed -> 503, order stays pending  [503 {"error":"Webhook not configured"}]
PASS  A2  forged with attacker-signed header -> 503  [503]
PASS  A3  empty body -> 503  [503]
PASS  A4  GET -> 405  [405]
PASS  A5  1 MB junk body -> 503, no crash  [503]
PASS  A6  no rows created or changed by any A request  [rows 21 -> 21]
PASS  B1  missing signature -> 400  [400 {"error":"Missing stripe-signature header"}]
PASS  B2  garbage signature -> 400  [400 {"error":"Webhook signature verification failed"}]
PASS  B3  signed with wrong secret -> 400  [400]
PASS  B4  valid signature over a different body (tamper) -> 400  [400]
PASS  B5  correctly signed but 10 min old (outside 300s tolerance) -> 400  [400]
PASS  B6  validly signed non-JSON body -> 400, no 500  [400 {"error":"Webhook signature verification failed"}]
PASS  B7  valid signature plus an extra junk v1 entry -> 200 (rotation-style header)  [200 {"received":true,"handled":true}]
PASS  B8  replayed signed completed on advanced order -> 200, no regression  [200 preparing]
PASS  B9  late signed expired after paid -> 200, not cancelled  [200 preparing]
PASS  B10  signed expired on pending -> cancelled  [200 {"received":true,"handled":true}]
PASS  B11  signed completed with payment_status=unpaid -> not marked paid  [200 {"received":true,"handled":false}]
PASS  B12  signed completed for unknown order -> 200, no row created  [200 {"received":true,"handled":true}]
PASS  B13  signed unhandled event type -> 200 handled:false  [200 {"received":true,"handled":false}]
PASS  B14  25 concurrent identical signed events -> all 200, single received state  [25 x 200]
PASS  B15  signed event with unicode/HTML in payload, text/plain content-type -> 200 paid  [200]
PASS  B16  1 MB body with mismatched signature -> 400, no crash  [400]
PASS  B17  signed event with SQL-injection-shaped order id -> no other orders touched  [pending 1 -> 1]
PASS  H1  container B still serves / after the sweep  [200]

24/24 passed
```

Curated categories covered: missing_cookies/expired_tokens (missing, stale and
wrong signatures), max_inputs (1 MB bodies), special_chars (unicode, HTML,
SQL-shaped ids), race_conditions (a 25-way concurrent replay), and empty_states
(empty body, unknown order). slow_network, mobile_viewports (beyond the
390x844 headless run), denied_permissions and auth_navigation have no webhook
surface to test here.

## 3. Theater Check

| PR #25 claimed | Verification found | Verdict |
|---|---|---|
| No secret means 503 before the body is read, and nothing is processed | A1, A3, A5 (1 MB body) all 503; A6 shows no row created or changed | CONFIRMED |
| Misconfiguration is logged once | Container A log has exactly one `[stripe-webhook]` line across 6+ requests | CONFIRMED |
| Verification runs over the raw body and needs no API key | Every B check ran with `STRIPE_SECRET_KEY` empty; B4 (tamper) and B15 (text/plain) behave as expected for raw-body HMAC | CONFIRMED |
| Missing or invalid signature gets 400, with no verifier detail echoed | B1 to B6 return 400; the response body is a fixed string | CONFIRMED |
| Event handling is idempotent, so a replay does not double-apply | B8, B9, B14 (25-way race) | CONFIRMED |
| The site still works with the webhook off (reconcile on the confirmation page) | Container A serves every page. The reconcile path itself calls Stripe, so it was **not** exercised here | NOT VERIFIED (out of scope, needs a Stripe call) |
| 6 of 11 new tests fail against the old route | Reproduced by swapping in the `origin/main` route.ts during the code layer | CONFIRMED |
| The "logs at most once" unit test proves the log-once behavior | That test depends on test order and also passes against the old route; the real check is the first test's `toHaveBeenCalledTimes(1)` | OVERSTATED (it is not one of the 6 that discriminate) |

## 4. Blockers

None attributable to this PR.

## 5. Warnings

### Pre-existing assertion drift, not fixed here

`verify/smoke.yml` and `verify/assertions/home.yml` both assert
`a[href='/reserve']` on home. The app links to `/reservations`:
- `src/app/page.tsx` lines 37 and 153, and the site header;
- the headed `find` on the hero CTA returned `href="/reservations"`;
- `/reserve` returns 404 on this build.

The assertions were written in #12, and #13 ("fix Reserve CTA") later pointed
the CTA at `/reservations`. CI Quick Verify skips `selector_present`, so the
drift never showed in CI. `git diff --stat origin/main...dee0ca7` touches 6
files (`.env.example`, `CLAUDE.md`, `README.md`, `docs/decisions.md`, the
webhook route and its test), none of them a page or anything under `verify/`.
Recommended follow-up chore: change both assertions to `a[href='/reservations']`
(the README page list has the same `/reserve` drift).

### Coverage gaps (stated so the PASS is not overclaimed)

- Creating a real Stripe Checkout session from `/api/checkout`, and the
  confirmation-page `checkout.sessions.retrieve` reconcile, were **not** run.
  Both need Stripe API calls, which this run did not allow. Only the checkout
  503 degrade path was shown. This PR does not modify either path.
- HSTS was not observable at the local origin. axe was skipped. The adversarial
  generator was not run.
- The webhook is intentionally dead (503) in production until the post-merge
  steps are done: register the endpoint in Stripe test mode, put the `whsec_`
  in the deploy env file, then redeploy.

### Minor, not blocking

- A signed event for an unknown order returns `handled:true` even though no row
  changes (B12). This behavior predates the PR.
- A validly signed non-JSON body gets the generic "signature verification
  failed" message (B6). That is acceptable because it reveals nothing.
