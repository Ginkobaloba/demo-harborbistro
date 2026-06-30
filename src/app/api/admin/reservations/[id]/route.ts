import { NextResponse } from "next/server";
import {
  ReservationTransitionError,
  setReservationStatus,
} from "@/lib/reservations";
import type { ReservationStatus } from "@/lib/types";

export const runtime = "nodejs";

const ALLOWED: ReservationStatus[] = ["seated", "completed", "cancelled"];

/**
 * POST /api/admin/reservations/[id]
 *
 * Host-stand action. Body: { status: "seated" | "completed" | "cancelled" }.
 * The lib enforces the legal flow (confirmed -> seated -> completed, cancel
 * before completion). Returns the updated reservation summary.
 *
 * Demo note: open like the rest of /admin (decisions D-011).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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
    const reservation = setReservationStatus(params.id, status);
    return NextResponse.json({
      id: reservation.id,
      status: reservation.status,
    });
  } catch (err) {
    if (err instanceof ReservationTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
