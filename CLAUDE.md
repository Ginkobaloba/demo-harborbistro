# demo-harborbistro: Project-local AI instructions

Read these on top of the global CLAUDE.md and `C:\dev\SESSION_PROTOCOL.md`.

## What this repo is

Demo #3 of the Paradigm portfolio demo set: Harbor Bistro, a fictional
upscale-casual coastal-American restaurant with online ordering and
reservations. Canonical spec: the demo-restaurant handoff (Drew's upload,
mirrored expectations live in `C:\dev\DEMOS_RUNNING_HANDOFF.md`).
Deployed at harborbistro.projectnexuscode.org via the Phase 0 demo infra
(`C:\dev\cloudflare-config`, port 8104).

## Hard constraints

- **Harbor Bistro has its OWN brand** (deep teal #1c4e54, warm cream
  #f8f1e4, warm coral #d9744a, warm dark #2c1f1a, serif headlines + sans
  body). It is intentionally distinct from Paradigm. Do not use Paradigm
  colors anywhere except the attribution banner.
- **The Paradigm banner** (`src/components/site/ParadigmBanner.tsx`) is a
  copy of the canonical `cloudflare-config/banner/ParadigmBanner.jsx` and
  renders at the very bottom of every page, below the demo disclaimer.
  Keep it in sync with the canonical contract; do not restyle it.
- **No em dashes anywhere** -- copy, code comments, docs. Use
  double-dashes, parens, or commas.
- **Stripe TEST mode only.** Never a live key. Test card 4242 4242 4242
  4242 in all examples.
- **Demo-only banner** stays visible at the site footer: orders and
  reservations are not real.
- **Mobile-first.** Most restaurant browsing happens on phones. Hero LCP
  target under 1.5s on mobile.
- **AI/ML is NOT featured** in this demo (selective-integration decision).

## Engineering posture

- Lightweight components, no shadcn. (If that changes: the shadcn CLI
  emits Tailwind-v4-only components onto this Tailwind v3 template; see
  demo-slatewell docs/decisions.md D-001 before pulling it in.)
- SQLite via better-sqlite3; database file is gitignored and created by
  `npm run db:seed`. It ships baked into the Docker image; runtime writes
  (orders, reservations) land in the container layer and reset on
  redeploy, which is fine for a demo.
- Card-sized chunks, one PR per chunk, squash auto-merge.
- Record nontrivial choices in `docs/decisions.md`.

## Git rules

Per `C:\dev\SESSION_PROTOCOL.md` section 7: every index-touching git
command runs from Windows PowerShell, never WSL/bash. Repo has
delete_branch_on_merge enabled; merge stacked PRs bottom-up.

## Handoffs

End every session with `docs/handoffs/HANDOFF_YYYY-MM-DD_<short>.md` from
`docs/handoffs/template.md`, including the Next Session Onboarding section.
Cross-session demo coordination happens in `C:\dev\DEMOS_RUNNING_HANDOFF.md`.
