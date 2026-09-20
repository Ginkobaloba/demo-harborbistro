import { handlePortalHandoff } from "./handler";

/**
 * UNREACHED in production as of 2026-09-19: the portal renders this demo
 * as an iframe tile, and iframe tiles receive no token today (the portal
 * never navigates the frame with a #portal_token fragment). The portal
 * side owns this decision and records it in `docs/PORTAL_GATE_CONTRACT.md`
 * (portal-shell); check there before assuming this route is live.
 *
 * Portal handoff endpoint (chunk 4b). The logic lives in ./handler so this
 * route file exports only the HTTP method handler Next.js allows; see
 * handler.ts for the flow and rationale.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return handlePortalHandoff(req);
}
