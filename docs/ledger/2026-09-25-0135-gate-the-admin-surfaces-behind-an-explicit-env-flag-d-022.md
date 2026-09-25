# 2026-09-25 01:35 CDT - Gate the admin surfaces behind an explicit env flag (D-022)
- **Who:** Claude Sonnet 5 (dispatched by Drew Mattick)
- **Change:** Added `src/lib/admin-gate.ts` (`adminSurfacesEnabled()`, true
  only when `HARBOR_ADMIN_ENABLED === "1"`). Called it first thing in the
  three admin page components (`notFound()` when closed) and first thing in
  the two `/api/admin/*/[id]` route handlers (404 when closed, before
  params, body parsing, or any DB access). Updated `visitor-scope.test.tsx`
  and `test/server/visitor-cookie.server.test.ts` to force the flag open
  (they test D-016 scoping on those surfaces, not this gate). Added
  `src/app/admin/admin-gate.test.tsx` covering the predicate, closed-gate
  404s with before/after row comparisons for the two route handlers
  (including two ordering cases proving the gate runs before body parsing),
  and open-gate normal operation for all five surfaces. Updated README,
  `.env.example`, and `scripts/verify-visitor-scope.ts`'s header.
- **Why:** `/admin` had no application-level gate; only the nginx
  containment in `cloudflare-config` (different repo, 404s `/admin` and
  `/api/admin`) and D-016's visitor-scoped SQL stood between a reachable
  request and the operator views. Harbor has no admin session primitive
  (`readHarborSession` has zero production callers, D-021, because the
  portal renders Harbor as an iframe tile that never sends it a token), so
  gating on a session check would be permanently false and misleading. An
  explicit opt-in flag is the honest version of the same "closed by
  default" outcome.
- **State after:** All five surfaces 404 with `HARBOR_ADMIN_ENABLED` unset
  (the production default) and work normally with it set to `"1"`. `npm
  test` (242 tests, 22 files), `npx tsc --noEmit`, `npm run lint`, and `npm
  run test:server` (post-build) all green. The nginx containment in
  `cloudflare-config` is untouched -- removing it is a separate, later
  change.
- **Refs:** docs/decisions.md D-022, D-016, D-017, D-021; src/lib/admin-gate.ts
