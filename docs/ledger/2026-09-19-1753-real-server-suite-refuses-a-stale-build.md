# 2026-09-19 17:53 CDT - Real-server suite refuses a stale build
- **Who:** Claude Sonnet 5 (session_01WAuS4DA21vazVZe9XMXuAw), on Drew's
  instruction to close a false-green class found across the demo fleet
  (first identified in iep-coach, confirmed here).
- **Change:** Added `scripts/build-stamp.mjs` (postbuild writes
  `.next/BUILD_STAMP.json` with the git HEAD sha and dirty flag; prebuild
  clears any stale stamp) and `test/server/fresh-build.ts` (`assertFreshBuild`,
  called from `test/server/harness.ts` and
  `test/server/body-caps.server.test.ts` before either starts a server).
  Added the `test:server` npm script. Recorded as D-020.
- **Why:** Both real-server test files started `.next/standalone/server.js`
  on the strength of a code comment telling the human to rebuild first. A
  comment is not a check: nothing stopped the suite from running against a
  build from an older commit, or a dirty tree, and reporting a result that
  described a different checkout than the one in front of it.
- **State after:** `npm run build` always stamps the build it just produced;
  both real-server test files refuse to start a server when the stamp is
  missing, unusable, from a different sha than HEAD, or from/against a
  dirty tree, and the failure message names both shas. Surveyed
  demo-slatewell, demo-axlepoint and lumen-analytics for the same class of
  bug: none found (their tests build throwaway temp databases per run;
  slatewell's Playwright e2e scripts require an already-running server on
  BASE_URL as a documented prerequisite but never build or spawn one
  themselves, so there is no in-repo build/db path for them to check).
- **Refs:** docs/decisions.md D-020, test/server/fresh-build.ts,
  scripts/build-stamp.mjs, PR (this branch fix/stale-build-guard).
