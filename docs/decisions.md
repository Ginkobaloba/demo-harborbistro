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
  chunked or understated upload is cut off at the cap. Over the cap is 413;
  unparseable or non-object JSON is 400. The Stripe webhook is untouched: it
  must read the exact raw body for signature verification (D-015) and stores
  no visitor text.
- **Field limits** (`FIELD_LIMITS`): name 100, phone 32, email 254, address
  300, notes 500 characters, measured after trimming in UTF-16 units, the
  same unit as the forms' `maxLength` (which now mirror them). Non-string
  values are refused rather than stringified. Carts are limited to
  `MAX_CART_LINES` (50) lines.
