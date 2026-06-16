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
