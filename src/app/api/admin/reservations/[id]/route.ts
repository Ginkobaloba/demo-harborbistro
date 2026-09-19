import { NextResponse } from "next/server";
import {
  ReservationNotFoundError,
  ReservationTransitionError,
  setReservationStatus,
} from "@/lib/reservations";
import type { ReservationStatus } from "@/lib/types";
import { scopeFromRequest } from "@/lib/visitor";

export const runtime = "nodejs";

const ALLOWED: ReservationStatus[] = ["seated", "completed", "cancelled"];

/**
 * POST /api/admin/reservations/[id]
 *
 * Host-stand action. Body: { status: "seated" | "completed" | "cancelled" }.
 * The lib enforces the legal flow (confirmed -> seated -> completed, cancel
 * before completion). Returns the updated reservation summary.
 *
 * Demo scope (D-016): acts only on seed bookings plus bookings this browser
 * made. Any other id is 404 with the same body as an unknown id.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const scope = scopeFromRequest(req);
  let body: { status?: string };
  try {
    body = (await req.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = body.status as ReservationStatus;
  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${ALLOWED.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const reservation = setReservationStatus(params.id, status, scope);
    return NextResponse.json({
      id: reservation.id,
      status: reservation.status,
    });
  } catch (err) {
    if (err instanceof ReservationNotFoundError) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }
    if (err instanceof ReservationTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
