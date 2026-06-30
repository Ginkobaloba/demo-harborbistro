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
  surface (D-011); gating waits on the federation follow-on.
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
