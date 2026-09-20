# 2026-09-19 20:17 CDT - Label unreached portal-handoff machinery, D-021
- **Who:** Claude Sonnet 5 (Orchestrator session), for Drew
- **Change:** Docs-and-comments only, no behavior/logic/test changes. Added
  an UNREACHED-in-production note (dated 2026-09-19) to the top of
  `src/app/api/auth/portal-handoff/route.ts`, `handler.ts`,
  `src/app/portal/handoff/page.tsx`, and a no-production-caller note on
  `readHarborSession` in `src/lib/portal-session.ts`. Each note attributes
  the reason to `docs/PORTAL_GATE_CONTRACT.md` (portal-shell) rather than
  restating it as a standalone fact, so it does not go stale silently if
  the portal's tile shape changes. Added D-021 in `docs/decisions.md`.
- **Why:** Two independent observations tonight agreed the portal-handoff
  machinery is dead code in production: the PR #37 deep verify found
  `readHarborSession` has zero callers anywhere in the repo, and the
  portal owner (portal-shell session) reports harborbistro is an iframe
  tile, the iframe path renders with no fragment, so the portal never
  navigates a visitor to `/portal/handoff#portal_token=...`. Wiring
  iframe identity (postMessage or a server-side token exchange) is a
  portal-side feature needing its own design, not a docs pass; we are
  labelling the risk, not fixing it, so a future reader does not mistake
  "tested" for "exercised" or treat this route as closing a live hole.
- **State after:** Tests unchanged (comment-only diff); check output
  recorded in the PR description. The route, handler, page, and
  `readHarborSession` remain fully implemented and unit-tested but
  unreached from production traffic, same as before this change.
- **Refs:** D-021 (docs/decisions.md); PR #41
  (demo-harborbistro); branch `docs/portal-gate-contract-note`; portal-shell
  `docs/PORTAL_GATE_CONTRACT.md`;
  `verify/reports/DEEP_VERIFY_2026-09-19_pr37-customer-session-claims.md`
