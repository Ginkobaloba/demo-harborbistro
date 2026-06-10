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
