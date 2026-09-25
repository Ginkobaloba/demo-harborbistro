/**
 * Application-level gate for the /admin surfaces (docs/decisions.md D-022).
 *
 * Why a flag and not a session check: Harbor has no admin authentication.
 * `portal-session.ts` (readHarborSession) exists but has zero production
 * callers (D-021) -- the portal renders Harbor as an iframe tile and never
 * navigates a visitor to the handoff route that would populate it, so a
 * session it reads would always be null. Gating admin on that check would
 * not add security; it would just make the surfaces permanently 404 while
 * *looking* like an auth check that could someday pass. It cannot. A caller
 * reading that code later would reasonably conclude a login flow exists and
 * "just isn't reached yet," which is false: there is no login flow to reach.
 *
 * An explicit opt-in env var is the honest version of the same outcome: OFF
 * by default (safe), ON only when an operator deliberately flips it (e.g. to
 * demo the staff view), and it does not pretend to be identity or
 * authorization. It is defence in depth alongside the nginx containment
 * (cloudflare-config: harborbistro.locations returns 404 for /admin and
 * /api/admin) and the visitor-scoped SQL (scopeSql, D-016) -- not a
 * replacement for either.
 *
 * Read at call time, not cached at import: the codebase's other env-backed
 * checks (readSessionSecret, PORTAL_VERIFIER) do the same, and tests toggle
 * the value mid-run.
 */

const ADMIN_GATE_ENV = "HARBOR_ADMIN_ENABLED";

/** True only when HARBOR_ADMIN_ENABLED is exactly "1". Any other value, including unset, is closed. */
export function adminSurfacesEnabled(): boolean {
  return process.env[ADMIN_GATE_ENV] === "1";
}
