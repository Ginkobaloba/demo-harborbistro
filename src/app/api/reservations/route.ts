import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableSlots,
  createReservation,
  slotsForDate,
} from "@/lib/reservations";

/** GET /api/reservations?date=YYYY-MM-DD -> { slots: string[], isClosed: boolean } */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  const isClosed = slotsForDate(date).length === 0;
  const slots = isClosed ? [] : getAvailableSlots(date);
  return NextResponse.json({ slots, isClosed });
}

/**
 * POST /api/reservations
 * Body: { name, phone, email?, partySize, date, time, notes? }
 * Returns: { id: string } (201) or { error: string } (400/409)
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, phone, email, partySize, date, time, notes } =
    body as Record<string, unknown>;

  if (!name || !phone || !partySize || !date || !time) {
    return NextResponse.json(
      { error: "name, phone, partySize, date, and time are required" },
      { status: 400 }
    );
  }
  if (typeof partySize !== "number" || partySize < 1 || partySize > 12) {
    return NextResponse.json(
      { error: "partySize must be 1-12" },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const available = getAvailableSlots(String(date));
  if (!available.includes(String(time))) {
    return NextResponse.json(
      { error: "That time slot is no longer available" },
      { status: 409 }
    );
  }

  const reservation = createReservation({
    name: String(name),
    phone: String(phone),
    email: email ? String(email) : null,
    partySize: Number(partySize),
    date: String(date),
    time: String(time),
    notes: notes ? String(notes) : null,
  });

  return NextResponse.json({ id: reservation.id }, { status: 201 });
}
