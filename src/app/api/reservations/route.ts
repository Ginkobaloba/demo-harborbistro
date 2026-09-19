import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableSlots,
  createReservation,
  slotsForDate,
} from "@/lib/reservations";
import {
  BODY_LIMITS,
  FIELD_LIMITS,
  asRecord,
  readJsonBody,
  textField,
} from "@/lib/request-body";
import { visitorCookieAttributes, visitorIdForWrite } from "@/lib/visitor";

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
 * Returns: { id: string } (201) or { error: string } (400/409, 413 when the
 * body is over BODY_LIMITS.reservation). Free-text fields are capped by
 * FIELD_LIMITS (D-017).
 */
export async function POST(req: NextRequest) {
  const read = await readJsonBody(req, BODY_LIMITS.reservation);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = asRecord(read.body);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { partySize, date, time } = body;
  const fields = {
    name: textField(body.name, "Name", FIELD_LIMITS.name),
    phone: textField(body.phone, "Phone", FIELD_LIMITS.phone),
    email: textField(body.email, "Email", FIELD_LIMITS.email),
    notes: textField(body.notes, "Notes", FIELD_LIMITS.notes),
  };
  for (const field of Object.values(fields)) {
    if (!field.ok) return NextResponse.json({ error: field.error }, { status: 400 });
  }
  const value = (f: (typeof fields)[keyof typeof fields]) => (f.ok ? f.value : "");
  const name = value(fields.name);
  const phone = value(fields.phone);
  const email = value(fields.email);
  const notes = value(fields.notes);

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

  // Tag the booking with this browser's visitor id so no other visitor can
  // see it in the admin views or on its confirmation page (D-016).
  const visitor = visitorIdForWrite(req);

  const reservation = createReservation({
    name,
    phone,
    email: email || null,
    partySize: Number(partySize),
    date: String(date),
    time: String(time),
    notes: notes || null,
    visitorId: visitor.visitorId,
  });

  const res = NextResponse.json({ id: reservation.id }, { status: 201 });
  if (visitor.minted) {
    res.cookies.set({ ...visitorCookieAttributes(), value: visitor.visitorId });
  }
  return res;
}
