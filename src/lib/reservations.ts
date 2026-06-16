import { getDb } from "./db";
import { newReservationId } from "./ids";
import type { Reservation } from "./types";

/**
 * All possible time slots per day-of-week (0=Sun, 1=Mon closed, 2=Tue...6=Sat).
 * Capacity is checked at query time against the reservations table (D-009).
 */
const ALL_SLOTS: Record<number, string[]> = {
  0: [
    "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00",
  ],
  2: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"],
  3: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"],
  4: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"],
  5: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"],
  6: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"],
};

export const SLOT_CAPACITY = 6;

/** All theoretical slots for a date string (YYYY-MM-DD). Empty on closed days (Monday). */
export function slotsForDate(dateStr: string): string[] {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dow = new Date(year, month - 1, day).getDay();
  return ALL_SLOTS[dow] ?? [];
}

/** Slots for a date that have not yet hit SLOT_CAPACITY confirmed reservations. */
export function getAvailableSlots(dateStr: string): string[] {
  const all = slotsForDate(dateStr);
  if (all.length === 0) return [];
  const db = getDb();
  const booked = db
    .prepare(
      `SELECT reserved_time, COUNT(*) c FROM reservations
       WHERE reserved_date = ? AND status != 'cancelled'
       GROUP BY reserved_time`
    )
    .all(dateStr) as { reserved_time: string; c: number }[];
  const full = new Set(
    booked.filter((r) => r.c >= SLOT_CAPACITY).map((r) => r.reserved_time)
  );
  return all.filter((s) => !full.has(s));
}

function rowToReservation(row: Record<string, unknown>): Reservation {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    email: (row.email as string | null) ?? null,
    partySize: row.party_size as number,
    reservedDate: row.reserved_date as string,
    reservedTime: row.reserved_time as string,
    notes: (row.notes as string | null) ?? null,
    status: row.status as Reservation["status"],
    createdAt: row.created_at as string,
  };
}

export function createReservation(data: {
  name: string;
  phone: string;
  email?: string | null;
  partySize: number;
  date: string;
  time: string;
  notes?: string | null;
}): Reservation {
  const db = getDb();
  const id = newReservationId();
  db.prepare(
    `INSERT INTO reservations
       (id, name, phone, email, party_size, reserved_date, reserved_time, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`
  ).run(
    id,
    data.name,
    data.phone,
    data.email ?? null,
    data.partySize,
    data.date,
    data.time,
    data.notes ?? null
  );
  return getReservation(id)!;
}

export function getReservation(id: string): Reservation | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM reservations WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToReservation(row);
}

export function getAllReservations(): Reservation[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM reservations ORDER BY reserved_date, reserved_time, created_at"
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToReservation);
}

/** "16:00" -> "4:00 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** "2026-06-20" -> "Friday, June 20" */
export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
