# HANDOFF -- 2026-06-10 -- chunks 3.1-3.4: scaffold, data layer, home, menu

## What this session did

- **Chunk 3.1 (scaffold + brand):** Next.js 14 App Router + TS + Tailwind
  v3 at `C:\dev\demo-harborbistro`, pushed to `Ginkobaloba/demo-harborbistro`
  (private, main, delete_branch_on_merge on). Harbor Bistro brand tokens in
  tailwind.config.ts (teal/cream/coral/ink + paradigm banner colors),
  Fraunces + Inter via next/font/google, paper-grain body background,
  standalone output, Unsplash remotePatterns. DemoBanner (disclaimer) +
  ParadigmBanner (typed copy of the canonical
  `cloudflare-config/banner/ParadigmBanner.jsx`, placed at the very BOTTOM
  per spec, decisions.md D-002).
- **Chunk 3.2 (data, PR #1):** better-sqlite3 schema (menu_items, orders,
  reservations), `npm run db:seed` (60 items / 7 courses / 42 live-checked
  photos / 20 orders all 4 statuses / 15 reservations next 2 weeks),
  `npm run db:verify` integrity gate that enforces the data-layer success
  criteria and exits nonzero. DB at `data/harborbistro.db` (gitignored),
  `HARBOR_DB_PATH` env override for the container.
- **Chunk 3.3 (home, PR #2):** hero + hours strip + 4-item featured preview
  from SQLite + philosophy/reservation CTA; shared SiteHeader/SiteFooter in
  the root layout; `src/lib/restaurant.ts` (fictional facts) and
  `src/lib/menu.ts` (query helpers). **Added `sharp`** -- standalone-mode
  image optimization hard-errors without it; this would have broken the
  Docker deploy.
- **Chunk 3.4 (menu, PR #3):** /menu with 7 course sections, sticky course
  nav + dietary chips (Vegetarian, Vegan, Gluten-Free, Nut-Free per
  decisions.md D-006), DietaryBadges, client-side filtering.
- Coordination kept current in `C:\dev\DEMOS_RUNNING_HANDOFF.md` (Phase 0
  is COMPLETE: harborbistro = host port 8104, DNS + ingress live, deploy
  script ready; URL 502s until our container ships).
- Preview server registered as `harborbistro-prod` (port 3104) in
  `C:\dev\.claude\launch.json`.

## What is currently broken or incomplete

- `/menu/[slug]` links 404 (chunk 3.5 is next). /order, /reserve, /about,
  /visit, /private-events do not exist yet (chunks 3.5-3.10).
- **16 Dependabot vulns** (6 high) on the default branch, inherited from
  the create-next-app@14 template deps (eslint 8 chain, glob 7, etc.).
  Needs a triage pass; do not `npm audit fix --force` blindly (it wants
  breaking major bumps).
- Repo-level "allow auto-merge" kept failing via `gh repo edit
  --enable-auto-merge` (GraphQL enablePullRequestAutoMerge error); PRs were
  merged with direct `gh pr merge --squash` immediately after creation,
  which is equivalent here since there are no required checks.
- Preview screenshot tool times out on this machine (server itself is
  healthy; verified over HTTP instead). No pixel-level visual check has
  happened yet; do one before calling 3.12 done.
- `vstart`/`vend` were not run this session (repo did not exist at session
  start; vend's interactive commit prompt does not fit an agent session).
  Tree is clean and pushed, which is what vend enforces.

## What the next session should do first

1. Read `C:\dev\DEMOS_RUNNING_HANDOFF.md` for cross-session state changes
   (Phase 0 banner updates, port changes, AxlePoint/Slatewell/Lumen notes).
2. `npm run db:seed` then `npm run db:verify` (db file is gitignored, you
   need a local one), then `npm run build` to confirm a clean baseline.
3. **Chunk 3.5:** /menu/[slug] item detail: large photo, full description,
   customization groups (the JSON is already on every item and typed in
   `src/lib/types.ts`; radio for single, checkbox for multi, priceCents
   upcharges), quantity, Add to Cart.
4. **Chunk 3.6:** cart state + drawer. Decide Zustand vs React Context and
   record it in docs/decisions.md (spec allows either; nothing is committed
   to yet). Cart must persist across navigation (in-memory is fine, spec
   says so; sessionStorage is a nice-to-have).
5. Then 3.7 Stripe Test Mode checkout -- this needs a STRIPE TEST key from
   Drew (Tier 3, surface via Dispatch before starting 3.7).

## Open questions for Drew

- Stripe Test Mode keys (publishable + secret) are needed by chunk 3.7.
  None found in `C:\dev\_secrets\`. Mint at dashboard.stripe.com in Test
  Mode when convenient.

## Pointers

- Spec: the demo-restaurant handoff (Drew's upload of 2026-06-09);
  live coordination: `C:\dev\DEMOS_RUNNING_HANDOFF.md`
- Decisions: `docs/decisions.md` (D-001 through D-006)
- Deploy (when site is feature-complete enough):
  `C:\dev\cloudflare-config\scripts\deploy-demo.ps1 -Name harborbistro
  -ContextPath C:\dev\demo-harborbistro -InternalPort 3000`, recipe in
  `cloudflare-config/docs/demos/README.md`. Dockerfile not written yet;
  remember `npm run db:seed` at image build and `sharp` is already a dep.

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart`.
