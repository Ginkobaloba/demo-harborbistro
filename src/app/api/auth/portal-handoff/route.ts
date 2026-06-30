import { handlePortalHandoff } from "./handler";

/**
 * Portal handoff endpoint (chunk 4b). The logic lives in ./handler so this
 * route file exports only the HTTP method handler Next.js allows; see
 * handler.ts for the flow and rationale.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return handlePortalHandoff(req);
}
