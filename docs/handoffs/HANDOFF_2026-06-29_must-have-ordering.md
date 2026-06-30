# HANDOFF -- 2026-06-29 -- must-have ordering (tracking, operator, modifiers, search)

Closed Drew's "must-have" gap analysis for Harbor Bistro on branch
`feat/must-have-ordering` (off `main` @ `0b9f2c5`). All four gating items
done, verified end-to-end, build green.

## What this session did

- **Order tracking (gap 1).** `/order/confirmation/[id]` now embeds a live
  `OrderTracker` (Received -> Preparing -> Ready -> Completed stepper) that
  seeds from the server status and polls `GET /api/orders/[id]` every 5s
  until terminal. Verified: advanced an order in the operator board and the
  open confirmation page moved to "Preparing" on its own, no reload.
- **Modifier expansion (gap 2).** Went from ~6 to **43 of 60 items** carrying
  options, touching **all 7 categories**. New reusable groups in
  `menu-items.ts` (bun choice, sandwich/side add-ons, dipping sauces, spice
  level, oyster size, salad portion, salmon doneness, a-la-mode, drink size,
  coffee milk, cocktail strength, rim). Required radios on
  steaks/salmon/salads/drinks/oysters/cocktails; multi checkboxes on
  snacks/burgers/sides/desserts. Prices/photos/dietary flags untouched.
- **Operator console (gap 3).** New `/admin` hub, `/admin/orders` (3-column
  kitchen display + recent table + state-transition buttons), and an
  upgraded `/admin/reservations` ("Tonight" working set + seat/complete/cancel
  on the full book). Both auto-refresh. Transitions enforced server-side in
  the lib (`advanceOrder`, `cancelActiveOrder`, `setReservationStatus`),
  idempotent, illegal moves 409. SQLite is the source of truth.
- **Search (gap 4).** Live name/description search in `MenuBrowser`, composes
  with the existing dietary filters (untouched), with clear + empty states.
- **Stripe wired and proven.** The test keys at
  `_secrets\stripe_test_keys.local.txt` are now present; created `.env.local`
  (gitignored). `POST /api/checkout` returns a real `checkout.stripe.com`
  session and persists a pending order; the webhook flips it to `received`.
  Server-side reprice confirmed correct (GF bun +$2, bacon +$3, extra-patty
  +$5 -> $27/unit burger).
- **Fixed a pre-existing `next build` breaker (D-014).** `portal-handoff`
  exported a non-handler from `route.ts`; moved it to `handler.ts`. The demo
  builds and is deployable again.
- **Tests:** +14 unit tests for order/reservation transitions (temp DB).
  Full suite **37/37 green**. `tsc --noEmit`, `next lint`, and `next build`
  all clean.
- Recorded D-012/D-013/D-014 in `docs/decisions.md`.
- Parked stale superseded WIP from `fix/audit-static-pages` in a git stash
  (message references this session) -- it was the never-merged half of the
  PR #13 work; recover with `git stash list` if ever needed.

## What is currently broken or incomplete

- **Not yet committed/pushed/PR'd at time of writing** (next action below).
- **Operator surfaces are open (no auth)**, consistent with the prior admin
  posture (D-011). Gating waits on the federation follow-on chunk.
- **Nice-to-haves intentionally skipped** (non-gating per the brief): cart
  upsell, "popular/recommended" rails.
- **Live deploy untouched.** This is local-verified only; the running
  container at port 8104 / harborbistro.projectnexuscode.org still has the
  old build. Deploy is a separate step (and the nginx Terraform template
  IPv6 fix from the 2026-06-16 handoff is still outstanding for deploys).
- **STRIPE_WEBHOOK_SECRET not set locally** -- the confirmation page
  reconciles via session retrieve, so it isn't needed for the demo, but a
  production deploy should set it so the webhook verifies signatures.

## What the next session should do first

1. **Commit, push, open the PR** for `feat/must-have-ordering` (if this
   session did not finish it). Squash auto-merge per repo convention.
2. **Deploy** once merged: `deploy-demo.ps1` for harborbistro, remembering to
   inject `STRIPE_SECRET_KEY` (and ideally `STRIPE_WEBHOOK_SECRET`) into the
   container env, and to carry the nginx IPv6 resolver fix.
3. Optional polish: cart upsell + "popular" rail; gate `/admin` behind the
   portal session.

## Open questions for Drew

- **Operator auth:** keep `/admin` open for the demo (current), or gate it
  behind the portal `hb_session` now? Left open to match D-011.
- **Alcohol ordering:** cocktails are orderable online with modifiers (to
  satisfy "touch every category"). Fine for a demo; flag if you want them
  display-only.
- **Stripe keys in deploy:** confirm `deploy-demo.ps1` injects
  `STRIPE_SECRET_KEY` into the harbor container, else live checkout 503s.

## Pointers

- Spec: Drew's must-have gap analysis (this session's prompt); live
  coordination in `C:\dev\DEMOS_RUNNING_HANDOFF.md`
- Decisions: `docs/decisions.md` (D-012, D-013, D-014)
- Tracking: `src/components/order/OrderTracker.tsx`,
  `src/app/api/orders/[id]/route.ts`
- Operator: `src/app/admin/**`, `src/components/admin/**`,
  transitions in `src/lib/orders.ts` + `src/lib/reservations.ts`
- Modifiers: `src/data/menu-items.ts` (reusable group consts at top)
- Search: `src/components/menu/MenuBrowser.tsx`
- Dev server: launch config `harborbistro-dev` (port 3114) in
  `C:\dev\.claude\launch.json`; needs `.env.local` for Stripe

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart`.
