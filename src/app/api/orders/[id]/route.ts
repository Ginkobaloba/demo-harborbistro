import { NextResponse } from "next/server";
import { getOrder } from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { scopeFromRequest } from "@/lib/visitor";

// better-sqlite3 needs the Node.js runtime.
export const runtime = "nodejs";

/**
 * GET /api/orders/[id]
 *
 * Lightweight order-status read for the live tracker on the confirmation
 * page. Returns only what the tracker renders -- status and timestamps --
 * never customer PII.
 *
 * Scoped to the calling browser (D-016): order codes are short (5 symbols
 * from a 31-symbol alphabet, about 25 bits) so they are enumerable, and the
 * code alone is not treated as a bearer token. Only a seed order or one this
 * browser placed resolves; anything else is 404.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const order = getOrder(params.id, await scopeFromRequest(req));
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: order.id,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    fulfillment: order.fulfillment,
    updatedAt: order.updatedAt,
  });
}
