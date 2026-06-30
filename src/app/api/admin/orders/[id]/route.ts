import { NextResponse } from "next/server";
import {
  OrderTransitionError,
  advanceOrder,
  cancelActiveOrder,
} from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/orders/[id]
 *
 * Operator action on a paid order. Body: { action: "advance" | "cancel" }.
 * "advance" steps received -> preparing -> ready -> completed; "cancel" voids
 * an in-progress order. The lib enforces legal transitions and is idempotent,
 * so a double-click is harmless. Returns the updated order summary.
 *
 * Demo note: no auth gate yet, consistent with the open /admin surfaces
 * (decisions D-011). A later chunk gates /admin behind the portal session.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const order =
      body.action === "advance"
        ? advanceOrder(params.id)
        : body.action === "cancel"
          ? cancelActiveOrder(params.id)
          : null;
    if (!order) {
      return NextResponse.json(
        { error: 'action must be "advance" or "cancel"' },
        { status: 400 },
      );
    }
    return NextResponse.json({
      id: order.id,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
    });
  } catch (err) {
    if (err instanceof OrderTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
