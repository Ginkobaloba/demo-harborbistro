import { NextResponse } from "next/server";
import { getOrder } from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/types";

// better-sqlite3 needs the Node.js runtime.
export const runtime = "nodejs";

/**
 * GET /api/orders/[id]
 *
 * Public, lightweight order-status read for the live tracker on the
 * confirmation page. Returns only what the tracker renders -- status and
 * timestamps -- never customer PII. The order code itself is the (random,
 * unguessable) bearer token, the same posture as the confirmation URL.
 */
export function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const order = getOrder(params.id);
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
