# HANDOFF -- 2026-06-12 -- chunks 3.5-3.6 + Dockerfile: SITE IS LIVE

## What this session did

- **Chunk 3.5 (item detail, PR #4):** `/menu/[slug]` statically generated
  for all 60 items via `generateStaticParams` + `dynamicParams = false`
  (unknown slugs 404; safe because the menu only changes at seed time and
  the DB ships baked into the image). Large photo, course label, price,
  dietary badges, description. `ItemCustomizer` renders the per-item
  customization JSON: radio for single groups (first choice preselected,
  required groups labeled), checkboxes for multi, upcharges priced into a
  live unit/total, quantity stepper 1-12. New `getAllSlugs()` in
  `src/lib/menu.ts`.
- **Chunk 3.6 (cart, PR #5):** decided **React Context + useReducer over
  Zustand**, recorded as decisions.md D-007 (tiny API surface, three
  consumers, minimal-deps posture). `CartProvider` with sessionStorage
  persistence (hydrate-after-mount, no SSR mismatch) and canonical line
  keys (slug + sorted selections) so identical configurations merge.
  `CartDrawer` slide-over (selection labels, per-line steppers, remove,
  subtotal, checkout stub for 3.7), `CartButton` badge in the header.
  ItemCustomizer's 3.5 stub now adds real lines and opens the drawer.
- **Dockerfile (PR #6):** two-stage node:22-bookworm-slim (Slatewell's
  shape) with `db:seed` AND `db:verify` at image build (bad seed fails
  the build), standalone output + static + data/ in the runner. sharp
  verified working inside the container (optimizer returns image/jpeg).
- **DEPLOYED: https://harborbistro.projectnexuscode.org is LIVE** via
  `deploy-demo.ps1` (port 8104), verified 200 through Cloudflare by the
  script and spot-checked after (home/menu/item 200, bad slug 404).
  BROOKFIELD skipped: known ssh perms blocker, single-host HA for now.
- Verification along the way: builds green every chunk; chunk 3.6 proven
  with a 13-check Playwright run at 390px viewport (upcharge pricing,
  quantity math, drawer contents, badge counts, persistence across client
  nav AND full reload, remove/empty states, checkout disabled when empty).
  Driver: `C:\dev\_tools\shot\e2e-harbor-cart.mjs`.
- Coordination updated in `C:\dev\DEMOS_RUNNING_HANDOFF.md` (status table
  + session log).

## What is currently broken or incomplete

- **Chunk 3.7 (Stripe Test Mode checkout) is BLOCKED on Drew:** no Stripe
  test keys anywhere in `C:\dev\_secrets\` (re-checked this session).
  Slatewell's 4.4 is parked on the same thing.
- /order, /reserve, /about, /visit, /private-events still 404 (chunks
  3.7-3.10). The header's "Order Online" CTA points at /order, so the
  most visible 404 on the live site is that button; consider making 3.7's
  order page (or an interim redirect to /menu) the next ship even if
  Stripe stays parked.
- BROOKFIELD replication still down (ssh config icacls, Tier 3 infra).
- 16 Dependabot alerts on the default branch (Next 14 chain); waiting on
  Drew's fleet-wide Next 14 vs 15 posture call. The postcss + glob clean
  bumps the Phase 0 triage identified have NOT been taken here yet; fold
  into the next chunk.
- `vend` not run as a script this session (interactive commit prompt does
  not fit agent sessions); equivalent done manually: tree clean, pushed.

## What the next session should do first

1. Read `C:\dev\DEMOS_RUNNING_HANDOFF.md` for cross-session changes.
2. `npm run db:seed && npm run db:verify && npm run build` for a local
   baseline (DB is gitignored).
3. If Stripe test keys have landed in `C:\dev\_secrets\`: chunk 3.7
   (checkout: order page reading the cart, tip selection, Stripe Test
   Mode payment intent, order confirmation writing to SQLite, status
   page at /order/status/[id]). Test card 4242 4242 4242 4242 only.
4. If keys are still absent: chunk 3.8 reservations (form + SQLite write
   + confirmation) and/or 3.9 static pages (about, visit, private
   events), and take the postcss + glob clean bumps. Redeploy after any
   shipped chunk: `deploy-demo.ps1 -Name harborbistro -ContextPath
   C:\dev\demo-harborbistro -InternalPort 3000 -VerifyContent "Harbor
   Bistro"`.

## Open questions for Drew

- **Stripe Test Mode keys** (publishable + secret) for chunk 3.7. Drop at
  `C:\dev\_secrets\stripe_test_keys.local.txt` (Slatewell's requested
  path; both demos will read from there).
- Next 14 vs 15 fleet posture (Phase 0 triage, affects the 16 Dependabot
  alerts here).

## Pointers

- Spec: the demo-restaurant handoff (Drew's upload of 2026-06-09);
  live coordination: `C:\dev\DEMOS_RUNNING_HANDOFF.md`
- Decisions: `docs/decisions.md` (D-001 through D-007)
- Deploy recipe: `cloudflare-config/docs/demos/README.md`
- Cart e2e driver: `C:\dev\_tools\shot\e2e-harbor-cart.mjs` (expects the
  prod server on localhost:3104)

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart`.
