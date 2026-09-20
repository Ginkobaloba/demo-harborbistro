# Harbor Bistro design decisions

Append-only log. One entry per nontrivial choice.

## D-001: Curated Unsplash stock for v0 photography (2026-06-10)

AI-generated food photos (Gemini) vs curated stock for v0: stock for v0,
swap to AI-generated in a later pass (chunk 3.11). Stock ships today and
looks consistent; the swap is a data-only change because photos live as
URLs on `menu_items.photo_url`.

## D-002: Paradigm banner at the very bottom (2026-06-10)

The Phase 0 banner README suggests rendering at the top of the app shell.
The Harbor Bistro spec explicitly puts the Paradigm banner at the very
bottom, below the demo disclaimer, so the restaurant brand owns the first
screen. Spec wins. The component itself is an unmodified (typed) copy of
the canonical `cloudflare-config/banner/ParadigmBanner.jsx` contract.

## D-003: Seed reservation dates are relative near-future (2026-06-10)

The 2026-06-10 paradigm-site incident produced a standing rule that demo
fixtures tied to Drew's real life (legal, career) must use far-future
dates so they can never map onto real events. Harbor Bistro is a wholly
fictional restaurant; its 15 seed reservations use dates relative to seed
time spread across the next 2 weeks, per spec, because realistic dates are
the point of the demo and there is no real-life mapping risk. Names,
phones, and emails in seed data are synthetic.

## D-004: SQLite baked into the image, container-layer writes (2026-06-10)

Same single-container posture as the other demos. The seeded database is
created at image build (`npm run db:seed`) and ships in the image. Orders
and reservations created at runtime write to the container layer and reset
on redeploy. Acceptable for a demo; Phase 0 confirmed no volume mount is
standardized yet, and if one appears it will be a `-Volume` param on
`deploy-demo.ps1` with no change needed to this posture.

## D-005: Order IDs are short human-readable codes (2026-06-10)

Orders and reservations use short uppercase codes (`HB-XXXXX`) instead of
integer ids: they appear in URLs (`/order/status/[id]`) and confirmation
screens, and a guessable sequential integer invites demo visitors to pull
up each other's fake orders. Codes are generated from a non-ambiguous
alphabet (no 0/O/1/I).

## D-006: Menu filter chip says "Nut-Free", not "Contains Nuts" (2026-06-10)

The spec lists the fourth sticky filter as "Contains Nuts". A filter chip
with that label is ambiguous at best (show items WITH nuts?) and the real
user need is allergy avoidance, so the chip is labeled "Nut-Free" and
excludes items flagged contains_nuts. Items still display an "N / Contains
nuts" badge inline, which is the informational half of the spec's intent.

## D-008: "Order Online" header CTA points at /menu until 3.7 ships (2026-06-16)

The header CTA "Order Online" was pointing at `/order`, which 404s because
Stripe checkout (chunk 3.7) is blocked on test keys. Three options considered:
- A: Point at `/menu` -- chosen. The menu -> item detail -> cart flow is
  fully functional; only the checkout payment step is missing. A visitor
  who clicks "Order Online" lands on a real, working page and can build
  a cart. The drawer's disabled checkout implies intent without confusion.
- B: Point at `/reservations` -- rejected. Confusing UX; someone who clicked
  "Order Online" wants food, not a table.
- C: Hide the button -- rejected. Too much collateral damage to the primary CTA.
Revisit when Stripe test keys land in `_secrets\` and chunk 3.7 ships.

## D-009: Reservation slot capacity is 6 per time slot (2026-06-16)

The DB schema has no `tables` table -- availability is derived from the
`reservations` table. A slot is considered full when 6 or more non-cancelled
reservations exist for that date+time combination. 6 maps loosely to a
~60-cover coastal bistro with 30-min turn windows, and keeps most demo slots
open (15 seed reservations spread across 14 days will rarely saturate any
one slot). The `SLOT_CAPACITY` constant lives in `src/lib/reservations.ts`
for easy tuning.

## D-007: Cart state is React Context + useReducer, not Zustand (2026-06-12)

The spec allows either. Context wins here because the cart's API surface is
tiny (add, remove, set quantity, clear, open/close drawer), the consumer
count is three components (header badge, drawer, item customizer), and the
repo posture is minimal dependencies (no shadcn, hand-rolled primitives).
Zustand's advantages (selector-level re-render control, persist middleware,
no provider) do not pay for a new dependency at this scale. Persistence is
sessionStorage with hydrate-after-mount so server and first client render
agree on an empty cart (no hydration mismatch); per spec, in-memory was
acceptable and sessionStorage is the nice-to-have. Cart lines carry a
canonical key (slug + sorted selections) so identical configurations merge
instead of duplicating lines. Revisit only if the cart grows cross-cutting
consumers (e.g. per-item quantity badges on the full menu grid).

## D-010: Chunk 3.7 uses Stripe-hosted Checkout, server-side repricing, pending orders (2026-06-17)

Online ordering (the /order route, previously a dead link) now runs real
Stripe test-mode payments. Decisions:

- **Stripe-hosted Checkout, not embedded.** The card form lives on Stripe's
  page, so the demo never touches PAN data and stays out of PCI scope. The
  /order page collects cart + customer details, POSTs to /api/checkout, and
  redirects to the returned session URL.
- **Server-side repricing is the integrity gate.** /api/checkout never trusts
  a client price. priceCart() re-derives every line from the menu db (base
  price plus per-choice upcharges) and rejects unknown items, bad quantities,
  and invalid or missing-required selections. Same posture as db:verify for
  the seed.
- **Orders are created `pending`, confirmed on payment.** A new order row is
  inserted before redirect (status pending), then moved to `received` by both
  the webhook (checkout.session.completed) and the confirmation page's Stripe
  reconcile, idempotently. This added `pending` and `cancelled` to the order
  status set and a stripe_checkout_session_id column. The kitchen/customer
  only ever see paid orders as real.
- **Absolute URLs come from the Host header, never request.url.** Stripe
  success/cancel URLs must be absolute and public; the Next standalone server
  reports 0.0.0.0:3000 as its origin (same root cause as the redirect bug
  fixed fleet-wide), so publicOrigin() reads X-Forwarded-Host/Host (the proxy
  sets the real host) with a PUBLIC_BASE_URL env override.
- **Keys are runtime-only.** STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET) are
  read lazily at request time so `next build` needs no key; checkout degrades
  to a clear 503 when unconfigured. The deploy must inject these env vars into
  the container (deploy-demo.ps1 does not pass env yet -- tracked separately).
  Superseded in part by D-015: the webhook no longer "works" without its
  secret; it fails closed.

## D-011: Chunk 4b federates auth to the Paradigm Portal via JWKS (2026-06-19)

Harbor Bistro now accepts portal-minted access tokens as the entry to a
signed-in session. Decisions:

- **Local JWKS verification per the gate contract.** verifyPortalToken
  fetches and caches the portal's `/.well-known/jwks.json`, then validates
  RS256 tokens with `iss=https://portal.projectnexuscode.org`,
  `aud=harborbistro`, and a non-empty `sub`. The contract's authoritative
  `/api/portal-check` path stays available for higher-stakes calls if a
  later feature needs it; v1 is local-only.
- **Fragment handoff over cookie.** Portal redirects to
  `/portal/handoff#portal_token=...`. The client page reads
  window.location.hash, scrubs it from history before doing anything else,
  then POSTs the token to `/api/auth/portal-handoff`. The fragment never
  reaches an HTTP server log on either side, which matches the
  contract's reasoning.
- **HS256 session cookie, 12h TTL, name `hb_session`.** Asymmetric keys
  inside a single tenant would be wasted complexity. Cookie is HttpOnly,
  SameSite=Lax, Secure in production. SESSION_SECRET must be 32 chars or
  longer; mint helper throws otherwise so misconfigured deploys fail
  loudly rather than ship a guessable secret.
- **Rotation grace via the jose JWKS cache.** createRemoteJWKSet caches
  the JWKS for one hour (matches the portal's Cache-Control) and refetches
  once per 30s on a kid miss, so a published rotation lands inside a
  minute without hammering the portal.
- **Generic 401 on any verify failure.** invalid_token, missing_token,
  bad_request, config_error are the only public reason codes. Detailed
  cryptographic failure modes are intentionally not surfaced; the gate
  contract says the same.
- **Existing surfaces stay open for now.** Harbor had no real auth before
  this chunk (admin/reservations is open in dev). Federation adds the
  signed-in path; a follow-on chunk will gate admin and post-checkout
  surfaces behind readHarborSession.

## D-012: Live order tracking + operator console (must-have, 2026-06-29)

Closing the "must-have" gap analysis. The order status set
(received/preparing/ready/completed) and the orders table already existed
from D-010; this chunk made them drivable and visible.

- **Confirmation page is the tracker.** Rather than a separate /order/track
  route, the existing /order/confirmation/[id] now embeds a client
  `OrderTracker` that seeds from the server-rendered status and polls
  `GET /api/orders/[id]` every 5s until terminal. The order code is the
  bearer token (random, unguessable), so the status endpoint returns status
  + fulfillment only, never PII. Stops polling on completed/cancelled.
- **Operator console at /admin (open, demo-only).** `/admin/orders` is a
  three-column kitchen display (Received | Preparing | Ready) plus a recent
  table; `/admin/reservations` gained a "Tonight" working set and the full
  book. Both auto-refresh via a small `AutoRefresh` client component
  (router.refresh on an interval + on focus). Kept open like the prior admin
  surface (D-011). **Drew confirmed 2026-06-30: leave /admin open for now;
  decide when to gate later.** The federation follow-on can wire
  `readHarborSession` whenever that call is made.
- **Transitions live in the lib, enforced server-side.** `advanceOrder`,
  `cancelActiveOrder` (orders.ts) and `setReservationStatus` (reservations.ts)
  validate legal moves and are idempotent under double-click via a status
  guard in the WHERE clause. Routes are thin: POST /api/admin/orders/[id]
  {advance|cancel} and POST /api/admin/reservations/[id] {status}. Illegal
  moves return 409. Covered by 14 new unit tests against a temp DB.
- **Seed now opens mid-service.** 5 reservations land on today (2 seated, 3
  confirmed) so the operator's "Tonight" view is non-empty, and seed order
  unit prices fold in single-choice upcharges so operator totals are honest.
  verify-seed's reservation-window check relaxed to include today.

## D-013: Modifier groups across every category (must-have, 2026-06-29)

The customizer (radios for required single-choice, checkboxes for multi)
already existed; only a handful of items carried options. Expanded to 43 of
60 items, touching all 7 courses, via reusable groups in menu-items.ts:
bun choice + sandwich add-ons, dipping sauces, spice level, oyster size,
salad portion ("make it a meal"), salmon doneness, a-la-mode, drink size,
coffee milk, cocktail strength, rim choice, loaded-side add-ons. Required
radios appear on steaks/salmon/salads/drinks/oysters/cocktails; multi
checkboxes on snacks/burgers/sides/desserts. Server-side priceCart() already
validates and reprices these, so no client trust was added. Photos, prices,
and dietary flags were left byte-identical.

## D-014: Move portal-handoff helper out of route.ts (build fix, 2026-06-29)

`next build` failed on main (a known pre-existing breaker): route files may
only export HTTP handlers + a small allow-list, but route.ts also exported
`handlePortalHandoff`/`HandoffDeps` for tests. Moved both into a sibling
`handler.ts`; route.ts now imports and exposes only `POST`. Test imports
updated to `./handler`. Behaviour unchanged; the demo builds and is
deployable again.

## D-015: Stripe webhook fails closed without its signing secret (2026-09-18)

The webhook used to fall back to `JSON.parse(body)` with no signature check
when `STRIPE_WEBHOOK_SECRET` was unset, which is exactly how production ran.
Anyone could POST a forged `checkout.session.completed` to the public route
and mark any pending order paid (test mode, so demo integrity rather than
money, but a real authz hole).

- **No secret, no processing.** The route returns 503 "Webhook not
  configured" before reading the body and logs the misconfiguration once per
  process. There is no dev bypass flag: `stripe listen` gives local dev a
  real `whsec_`, and a flag would be one more thing to defend.
- **Verify over the raw body** with the static `Stripe.webhooks.constructEvent`
  (a pure HMAC check, so verification needs neither `STRIPE_SECRET_KEY` nor
  network). Missing or invalid signature returns 400 with no verifier detail.
- **Idempotency stays in the data layer.** `markOrderPaid` and
  `markOrderCancelled` only move `pending` orders, so a replayed signed event
  (or an `expired` arriving after `completed`) is a no-op. No event-id table.
- **The site keeps working with the webhook off**: the confirmation page's
  `checkout.sessions.retrieve` reconcile is the fallback path.

## D-016: Per-visitor demo scope, Stripe test-key guard, 24h retention (2026-09-18)

`/admin` was open by design (D-012: prospects should be able to try the staff
view), but it showed every order and reservation in the database, including
the names, phone numbers and emails other visitors typed into `/order` and
`/reservations`. The fix keeps the open staff view and changes what it can
see.

- **Visitor id cookie.** `src/middleware.ts` gives every browser a random id
  (`crypto.randomUUID`, 122 random bits) in `hb_visitor`: HttpOnly,
  SameSite=Lax, Path=/, Secure in production, 30 days. Lax, not Strict,
  because the return from Stripe Checkout is a cross-site top-level GET that
  must carry the cookie. The middleware also injects a newly minted id into
  the forwarded request so the first page view already sees it. Anything but
  a lowercase v4 UUID (including the literal `seed`) is replaced.
- **Every record is tagged.** `orders.visitor_id` and
  `reservations.visitor_id` hold the creating browser's id; the create routes
  mint one themselves if the middleware did not, so no row is written
  untagged. Seed rows carry the reserved marker `seed`.
- **NULL is legacy, not seed.** An existing database gains the column in
  place (`migrate()` in `db.ts`, run on open). Seed rows are recognizable by
  their ISO timestamps (the app's own inserts use `datetime('now')`, which a
  visitor cannot influence), so they are backfilled to `seed`. Every other
  existing row stays NULL: visible to nobody, and NOT deleted automatically.
  Treating NULL as seed would have re-exposed exactly the rows this change
  exists to hide.
- **Scope is enforced server-side in the data layer.** Every read a visitor
  can reach (`getOrder`, `getActiveOrders`, `getRecentOrders`,
  `getKitchenCounts`, `getReservation`, `getAllReservations`,
  `getReservationsForDate`) and every operator transition (`advanceOrder`,
  `cancelActiveOrder`, `setReservationStatus`) takes a scope and matches
  `visitor_id = 'seed' OR visitor_id = <caller>`. The default scope is
  seed-only, so a forgotten call site fails closed. The Stripe reconciliation
  paths (webhook, confirmation reconcile after the scope check) stay
  unscoped; they are keyed by ids Stripe hands back and carry no cookie.
  `getAvailableSlots` stays unscoped because it returns only per-slot counts.
- **Out of scope looks exactly like missing.** Admin POSTs on another
  visitor's id return 404 with the same body as an unknown id; the public
  detail routes (`/api/orders/[id]`, `/order/confirmation/[id]`,
  `/reservations/[id]`) return 404. Order and booking codes are 5 symbols
  from a 31-symbol alphabet (about 25 bits): random, but enumerable, so the
  code alone is no longer treated as a bearer token.
- **Forms say it plainly.** Checkout and reservation forms carry "This is a
  demo. Please don't enter real personal details."
- **Portal sessions do not widen access.** The portal handoff does verify a
  signed token (RS256 against the portal JWKS, issuer and audience checked)
  before minting `hb_session`, but nothing reads that session to authorize
  the admin views today, so there was no staff path to preserve and none was
  added. Gating `/admin` on a portal staff role remains a separate call.
- **Stripe test keys only.** `src/lib/stripe-mode.ts` refuses any
  `STRIPE_SECRET_KEY` that does not start with `sk_test_`, and any
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` that is set but does not start with
  `pk_test_`. `getStripe()` throws and checkout answers 503 in that state;
  the server logs the refusal at boot (`instrumentation-node.ts`). The server
  still starts, so the rest of the demo stays up. The webhook route is
  unchanged (D-015).
- **24h retention.** `purgeExpiredVisitorData` (`src/lib/retention.ts`)
  deletes visitor-tagged rows older than 24 hours; seed rows are never
  touched. It runs when the server opens the database at boot and then at
  most hourly, triggered from `getDb()`. `npm run db:purge-visitors` runs it
  on request (`DRY_RUN=1` to count only). Legacy NULL rows are only removed
  with `INCLUDE_LEGACY=1`, an explicit operator decision.

## D-017: Checkout writes the order only after Stripe; public writes are size-capped (2026-09-19)

A deep verify of #28 found two pre-existing defects: with Stripe unreachable,
`POST /api/checkout` answered a bare 500 with an empty body and left a tagged
`pending` order row behind; and nothing capped a public request body, so a
1 MB reservation name was stored.

- **Order row after the session, not before.** better-sqlite3 transactions are
  synchronous and cannot span the `await` on Stripe, so "roll back on
  failure" would really be a compensating delete. Instead checkout mints the
  order id first (`unusedOrderId()`, which also checks the id is free), opens
  the Stripe session with it (client reference, metadata, success/cancel
  URLs), and only then inserts the `pending` row with the session id in the
  same statement. Any failure in session creation, including a session with
  no hosted URL, returns 503 with a fixed JSON message and writes nothing.
  The log line carries only the Stripe error type/code, never the message.
  If the insert itself fails after Stripe succeeded, the client gets a JSON
  500 and the unused test-mode session expires on its own. No webhook can
  reference the order before the row exists: payment only starts after the
  client is redirected, which happens after the insert.
- **Byte caps on every public write route** via `readJsonBody`
  (`src/lib/request-body.ts`): checkout 32 KB, reservations 8 KB, admin
  actions 1 KB, portal handoff 16 KB. A declared `Content-Length` over the
  cap is refused up front, and the stream is counted as it is read so a
  chunked upload is cut off at the cap. Over the cap is 413; unparseable or
  non-object JSON is 400. (An understated `Content-Length` never reaches the
  counter on a real server: Node's HTTP framing stops at the declared length,
  so the handler sees truncated JSON and answers 400.) The Stripe webhook is
  untouched: it must read the exact raw body for signature verification
  (D-015) and stores no visitor text.
- **Middleware no longer runs on `/api/`.** The first cut of this decision
  capped bodies in the handlers only, and the #31 deep verify showed it did
  not work on a real server: when middleware runs on a request with a body,
  Next 15.5 clones and buffers the whole upload (up to
  `middlewareClientMaxBodySize`, default 10 MB) and waits for it to end
  before the route handler starts. An endless chunked upload hung, a
  declared 1 MB got no early 413, and memory climbed under concurrent 9 MB
  uploads. The matcher now skips `api/`. Nothing under `/api/` needed it:
  the write routes mint and set `hb_visitor` themselves
  (`visitorIdForWrite`), and the reads use the cookie the browser already
  holds from the pages (seed-only scope without one). As defence in depth,
  `experimental.middlewareClientMaxBodySize` is `64kb`.
- **Proven against the built server, not just the handlers.**
  `test/server/body-caps.server.test.ts` starts `.next/standalone/server.js`
  (what the container runs) and sends raw HTTP: a declared 1 MB body gets 413
  in well under a second, an endless chunked upload gets 413 at the cap, the
  exact-cap body is accepted, and pages still get the visitor cookie while
  `/api/` does not. It needs a fresh build, so it has its own config:
  `npm run build` then `npx vitest run --config vitest.server.config.ts`.
  With the old matcher, the upload cases time out (no response in 10 s).
- **Stripe fails fast.** The client is built with a 10 s timeout and one
  retry (`STRIPE_CLIENT_OPTIONS`), about 21 s worst case, so a hung Stripe
  yields checkout's own 503 inside the proxy's 60 s read timeout instead of
  a 504 after about 241 s.
- **Tips are validated, not coerced, against a limit that scales.** The
  rules live in `src/lib/tip.ts` (pure, shared by the route and the order
  form). `tipCents` must be a JSON number that is a non-negative integer no
  larger than `maxTipCents(subtotal)` = max($1,000, 100% of the
  server-priced subtotal); absent or null means no tip. Booleans, strings,
  arrays and fractions are 400 (they used to be coerced, and 1e20 was
  forwarded to Stripe). A first cut used a flat $1,000 cap, and the #31
  re-verify showed it broke the form: its default 18% preset 400'd on any
  subtotal over about $5,556 (reproduced at $6,120). The form now computes
  presets with `presetTipCents`, which is clamped to the same limit, so a
  preset can never produce a tip the server refuses (unit-tested across
  subtotals up to $500,000). Multi-select add-on ids are de-duplicated, so a
  repeated add-on is charged once.
- **Over-cap uploads: 413, then the stream is closed at once.** When the
  counter trips, `readJsonBody` cancels the body stream immediately and the
  route answers 413. A client that is still writing may therefore see a TCP
  reset instead of reading the 413 (the #31 round-3 re-verify measured
  about 6% of over-cap uploads). That is accepted. A round-3 attempt to
  soften it by reading and discarding a bounded amount more (64 KB / 50 ms)
  was removed: its timed-out pending read made the stream cancel wait for
  more bytes, so a sender that crossed the cap by less than 64 KB and then
  stalled got no 413 at all (held 301 s, then 408), endless uploads slowed
  from about 7 ms to about 510 ms, and resets did not go down. The real-
  server suite now includes that stalled-sender case (413 in under 1 s on
  `/api/reservations` and `/api/checkout`).
- **Every failure before the response is JSON.** Minting the order id
  (`unusedOrderId`) is now wrapped in a try that returns the same JSON 500
  as a failed insert, before Stripe is called.
- **Field limits** (`FIELD_LIMITS`): name 100, phone 32, email 254, address
  300, notes 500 characters, measured after trimming in UTF-16 units, the
  same unit as the forms' `maxLength` (which now mirror them). Non-string
  values are refused rather than stringified. Carts are limited to
  `MAX_CART_LINES` (50) lines.

## D-018: The visitor cookie is signed (2026-09-19)

`hb_visitor` (D-016) was a random v4 UUID, HttpOnly, but unsigned, so its
value alone was a bearer token: anyone who learned a visitor's id (a shared
screenshot of devtools, a log line, a proxy) could set it and get that
visitor's scope in the admin views and on the confirmation pages. This
mirrors demo-slatewell D-016 so both demos share one design.

- **Format.** `hb_visitor=<v4 uuid>.<43 char base64url tag>`, where
  `tag = HMAC-SHA-256(visitorKey, uuid)`. The database keeps the bare id, so
  no migration and no change to the data layer's scope predicate.
- **Key derivation and domain separation.** `visitorKey =
  HMAC-SHA-256(SESSION_SECRET, "harborbistro:visitor-cookie:v1")`. The
  portal `hb_session` JWT stays keyed by the raw secret, so a visitor tag and
  a session signature are always computed under different keys, and the
  label differs from slatewell's, so a tag from one demo never verifies on
  the other even under a shared secret. The version in the label lets a
  future format change retire every old cookie at once. Web Crypto only
  (`crypto.subtle`, in `src/lib/visitor.ts`), because the Edge middleware
  verifies it too.
- **Verification.** `crypto.subtle.verify` (constant-time), after a strict
  shape check (lower-case v4 UUID, one dot, exactly 43 base64url chars), and
  only the canonical base64url spelling of the tag is accepted: the last
  character carries 2 spare bits, which would otherwise let a second
  spelling of the same tag verify.
- **Untrusted cookies are never trusted, only replaced.** An unsigned,
  tampered, malformed, or foreign-secret cookie (including another
  visitor's valid tag on this visitor's id) reads as "no visitor". Read
  paths treat it that way: the admin pages show seed data only, the admin
  POST APIs and `/api/orders/[id]` answer 404, and `/order/confirmation/[id]`
  and `/reservations/[id]` 404. Write paths (the middleware on page views,
  `POST /api/reservations`, `POST /api/checkout`) mint a fresh signed visitor
  instead of adopting the claimed id (`visitorIdForWrite`). `/api/` still
  skips the middleware (D-017), so the routes verify on their own with the
  same module.
- **Existing cookies become new visitors.** Every pre-D-018 cookie is a bare
  UUID, so after deploy each browser gets a new visitor id on its next page
  view and loses sight of its earlier demo orders and bookings. Accepted:
  visitor data expires within a day anyway (D-016 retention), it is demo
  data, and grandfathering unsigned ids would keep the bearer-token hole
  open.
- **No usable SESSION_SECRET: fail closed, like the rest of harbor.** The
  rule is the one the portal session already used (set, at least 32
  characters), now in one place (`src/lib/session-secret.ts`, shared by
  `portal-session.ts`), plus the published `.env.example` placeholder is
  refused by name. Without it nothing can be signed or verified, and a
  visitor cookie would be a bearer token again, so: `POST /api/reservations`
  and `POST /api/checkout` answer 503 ("Online ordering and reservations are
  temporarily unavailable in this environment.") before reading the body
  and before any Stripe call, so no row and no Stripe session is ever
  created; pages still render but the middleware sets no cookie; every read
  is seed-only, so detail pages 404; the server logs the problem once at
  boot, naming the rule and never the value. This matches D-015 (webhook
  503 without its secret), D-016 (checkout 503 without a test key) and the
  portal handoff (which already threw without the secret). The alternative,
  a random per-process key when the secret is missing, was rejected: it
  silently logs every visitor out on each restart and hides a
  misconfiguration that should be loud.
- **Deploy gate.** `SESSION_SECRET` changes from "portal sign-in only" to
  "required for ordering and reservations". The production env must set a
  32+ character random value before this ships, or both write paths 503.
  README and `.env.example` say so.
- **Verification.** `src/lib/visitor.test.ts` (format against an independent
  node:crypto computation; tampered, unsigned, B's tag on A's id,
  non-canonical final character, foreign secret, raw secret without the
  label, another label, malformed; fail closed for missing, empty, short and
  placeholder secrets), `src/middleware.test.ts`, `src/lib/visitor-scope.test.tsx`
  (the PR #28 two-browser guarantees with signed cookies, plus untrusted
  cookies on every read and write path and the no-secret 503s), and the
  real-server suite `test/server/visitor-cookie.server.test.ts` against the
  built standalone server, restarted without the secret for the fail-closed
  cases.

## D-019: Bound the hb_session lifetime by value, not just presence (2026-09-19)

Fleet audit `AUDIT_JWT_REQUIRED_CLAIMS_2026-09-19.md` (finding #3): jose's
`jwtVerify` validates `exp`, `iat`, and `nbf` only when the claim is
present, so a hand-signed `hb_session` token that simply omits `exp` was
never rejected by the signature check alone. `mintHarborSession` always
sets `sub`, `iat`, and `exp`, but anyone holding `SESSION_SECRET` could
sign a token by hand, and `verifyHarborSession` has to refuse it
regardless.

`verifyHarborSession` now passes `requiredClaims: ["sub", "iat", "exp"]`
and `maxTokenAge: SESSION_TTL_SECONDS` (the same 12-hour constant
`mintHarborSession` uses), plus an explicit post-verify check that `exp`
and `iat` are integers and `exp - iat` is positive and no greater than
the TTL, mirroring demo-slatewell's `admin-session.ts` (#38, #39). No
`jti` requirement: `mintHarborSession` does not mint one, and adding it
to `requiredClaims` without also minting it would reject every real
session. No `issuer`/`audience` check for the same reason: neither is
set at mint time.

Mutation check, both layers: deleting only the `requiredClaims` line does
not turn any of the 17 hand-signed tests red (0/17), because the
post-verify `typeof` guards already reject an absent `sub`, `exp`, or
`iat` independent of `requiredClaims` -- in this codebase, `requiredClaims`
is belt-and-suspenders with the shape checks, not the sole gate. Deleting
the explicit `exp - iat` bound block instead (keeping `requiredClaims` and
`maxTokenAge`) turns 5/17 red: exp a century out, fractional exp,
fractional iat (isolated from the future-iat case), a lifetime one hour
over the 12-hour TTL, and the boundary case one second over the TTL
(`exp - iat === SESSION_TTL_SECONDS` exactly is, correctly, still
accepted under the mutation, since `maxTokenAge` alone never rejects it).
`maxTokenAge` bounds `iat` against "now" but never relates it to `exp`,
so those shapes pass jose's own checks and are caught only by the
explicit bound. `SESSION_TTL_SECONDS` is exported from
`portal-session.ts` and imported by the test file so the TTL used in
tests can never drift from the one enforced at verify time.

No clock tolerance added: mint and verify share a process clock, so
there is no skew to absorb, and nothing else in this codebase uses
`clockTolerance`.

## D-020: The real-server suite refuses a stale build (2026-09-19)

`test/server/harness.ts` and `test/server/body-caps.server.test.ts` start
`.next/standalone/server.js`, the built standalone server, and talk raw HTTP
to it. Both files carried a comment saying they need a fresh `npm run
build`, but a comment is not a check: nothing stopped the suite from
starting a server built from an older commit, or from a dirty tree, and
reporting green (or a misleading red) against code that was not the
checkout. This is the same false-green class identified across the demo
fleet: a test or deploy path that reuses an existing build directory with
no check that the build matches the checkout.

- **Build stamp.** `scripts/build-stamp.mjs` runs as `postbuild` (after
  `npm run build` finishes) and writes `.next/BUILD_STAMP.json`: the git
  HEAD sha, whether the working tree was dirty at build time, and a build
  timestamp. `prebuild` deletes any existing stamp first, so a `next build`
  that fails partway through can never leave a stamp claiming a fresher
  build than actually happened. Inside the Docker build stage, `.git` is
  excluded by `.dockerignore` on purpose (D-004 lineage); `build-stamp.mjs`
  catches that and records `sha: null` with a reason instead of failing the
  image build. The deploy image never runs this suite, so that is fine; a
  null sha is refused by the check below, which is the correct default for
  unknown provenance.
- **The check.** `test/server/fresh-build.ts` exports `assertFreshBuild`,
  called at the top of `startServer` (harness.ts) and the `beforeAll` in
  `body-caps.server.test.ts`, before either spawns a server. It throws when:
  the stamp file is missing (`no build stamp: run npm run build`); the
  stamp has no usable sha (git was unavailable when it was written); the
  stamp's sha does not match the current `git rev-parse HEAD` (`stale
  build: build is from <sha>, checkout is <sha>. Run npm run build.`,
  naming both shas -- a bare "stale build" with no shas is exactly as
  unhelpful as a check that just says "0 entries"); or the tree was dirty
  at build time, or is dirty now. **Dirty fails rather than warns**: the
  sha comparison only means something when both trees are clean, so a dirty
  build (or a dirty checkout since) has no sha that actually describes it,
  and a suite that "passes with a warning" against unknown code is the same
  false green this decision exists to close.
- **Verification.** Proved by hand per the PR: build, run `npm run
  test:server`, confirm green; commit a change without rebuilding, confirm
  the suite fails and names both shas; rebuild, confirm green again.

## D-020: SCRATCH duplicate id, proves the decisions-check CI step can fail (2026-09-19)

This heading deliberately reuses D-020's id (docs/decisions.md already has
one at the top of this section) to reproduce the real 2026-09-19 collision
where two branches both claimed D-019 and merged with no conflict.
Reverted in the next commit.
