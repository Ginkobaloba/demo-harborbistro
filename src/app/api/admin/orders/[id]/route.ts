import { NextResponse } from "next/server";
import {
  OrderNotFoundError,
  OrderTransitionError,
  advanceOrder,
  cancelActiveOrder,
} from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { BODY_LIMITS, asRecord, readJsonBody } from "@/lib/request-body";
import { scopeFromRequest } from "@/lib/visitor";
import { adminSurfacesEnabled } from "@/lib/admin-gate";

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
 *
 * App-level gate (D-022): closed by default. Checked first, before params,
 * body parsing, or any DB access, so a closed gate never causes a side
 * effect.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  if (!adminSurfacesEnabled()) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  const params = await props.params;
  const scope = await scopeFromRequest(req);
  const read = await readJsonBody(req, BODY_LIMITS.adminAction);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = (asRecord(read.body) ?? {}) as { action?: string };

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
