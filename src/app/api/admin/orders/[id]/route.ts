import { NextResponse } from "next/server";
import {
  OrderNotFoundError,
  OrderTransitionError,
  advanceOrder,
  cancelActiveOrder,
} from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { scopeFromRequest } from "@/lib/visitor";

export const runtime = "nodejs";

/**
 * POST /api/admin/orders/[id]
 *
 * Operator action on a paid order. Body: { action: "advance" | "cancel" }.
 * "advance" steps received -> preparing -> ready -> completed; "cancel" voids
 * an in-progress order. The lib enforces legal transitions and is idempotent,
 * so a double-click is harmless. Returns the updated order summary.
 *
 * Demo scope (D-016): /admin stays open so prospects can try the staff view,
 * but it only acts on the fictional seed orders plus orders this browser
 * placed. Any other id, including another visitor's real order, is 404 with
 * the same body as an unknown id.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const scope = scopeFromRequest(req);
  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "advance" && body.action !== "cancel") {
    return NextResponse.json(
      { error: 'action must be "advance" or "cancel"' },
      { status: 400 },
    );
  }

  try {
    const order =
      body.action === "advance"
        ? advanceOrder(params.id, scope)
        : cancelActiveOrder(params.id, scope);
    return NextResponse.json({
      id: order.id,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
    });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (err instanceof OrderTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
