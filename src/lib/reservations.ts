import { newReservationId } from "./ids";
import type { Reservation } from "./types";
import { SEED_ONLY, scopeSql, type VisitorScope } from "./visitor";
import type { TenantDb } from "./pg";

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

/**
 * Slots for a date that have not yet hit SLOT_CAPACITY confirmed reservations.
 * Deliberately unscoped: it returns only per-slot availability (no names, no
 * contact details), and capacity is shared by every guest.
 */
export async function getAvailableSlots(
  db: TenantDb,
  dateStr: string,
): Promise<string[]> {
  const all = slotsForDate(dateStr);
  if (all.length === 0) return [];
  // Availability is deliberately NOT visitor-scoped: a slot another visitor
  // booked is unavailable to everyone, and hiding that would let two diners
  // book the same table. It leaks that *someone* booked 19:00, which is
  // inherent to showing availability at all.
  const booked = await db.query<{ reserved_time: string; c: number }>(
    `SELECT reserved_time, COUNT(*)::int c FROM reservations
      WHERE tenant_id = $1 AND reserved_date = $2 AND status <> 'cancelled'
      GROUP BY reserved_time`,
    [db.tenantId, dateStr],
  );
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

export async function createReservation(
  db: TenantDb,
  data: {
    name: string;
    phone: string;
    email?: string | null;
    partySize: number;
    date: string;
    time: string;
    notes?: string | null;
    /** The creating browser's visitor id (D-016). Required: no untagged rows. */
    visitorId: string;
  },
): Promise<Reservation> {
  const id = newReservationId();
  await db.query(
    `INSERT INTO reservations
       (tenant_id, id, name, phone, email, party_size, reserved_date, reserved_time,
        notes, status, visitor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10)`,
    [
      db.tenantId,
      id,
      data.name,
      data.phone,
      data.email ?? null,
      data.partySize,
      data.date,
      data.time,
      data.notes ?? null,
      data.visitorId,
    ],
  );
  return (await getReservation(db, id, { visitorId: data.visitorId }))!;
}

/**
 * Look up a reservation the caller is allowed to see: a seed booking or one
 * made by the caller's own browser (D-016). Returns null for an unknown id
 * and for another visitor's booking alike.
 */
export async function getReservation(
  db: TenantDb,
  id: string,
  scope: VisitorScope = SEED_ONLY,
): Promise<Reservation | null> {
  const params: unknown[] = [db.tenantId, id];
  const visitor = scopeSql(scope, params);
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM reservations WHERE tenant_id = $1 AND id = $2 AND ${visitor}`,
    params,
  );
  return rows[0] ? rowToReservation(rows[0]) : null;
}

/** The full book, scoped to seed bookings plus the caller's own. */
export async function getAllReservations(
  db: TenantDb,
  scope: VisitorScope = SEED_ONLY,
): Promise<Reservation[]> {
  const params: unknown[] = [db.tenantId];
  const visitor = scopeSql(scope, params);
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM reservations WHERE tenant_id = $1 AND ${visitor}
      ORDER BY reserved_date, reserved_time, created_at`,
    params,
  );
  return rows.map(rowToReservation);
}

/** Bookings on a date (local), in service order. Scoped like getAllReservations. */
export async function getReservationsForDate(
  db: TenantDb,
  dateStr: string,
  scope: VisitorScope = SEED_ONLY,
): Promise<Reservation[]> {
  const params: unknown[] = [db.tenantId, dateStr];
  const visitor = scopeSql(scope, params);
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM reservations WHERE tenant_id = $1 AND reserved_date = $2 AND ${visitor}
      ORDER BY reserved_time, created_at`,
    params,
  );
  return rows.map(rowToReservation);
}

// ------------------------------------------------------- operator transitions

/**
 * Legal next states for the host stand. A booking is confirmed, then seated
 * when the party arrives, then completed when they leave. Cancel is allowed
 * any time before completion. completed/cancelled are terminal.
 */
const RESERVATION_TRANSITIONS: Record<
  Reservation["status"],
  Reservation["status"][]
> = {
  confirmed: ["seated", "cancelled"],
  seated: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export class ReservationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationTransitionError";
  }
}

/**
 * Raised when the reservation is unknown or belongs to another visitor.
 * Routes map it to 404, so an out-of-scope id looks exactly like a missing one.
 */
export class ReservationNotFoundError extends ReservationTransitionError {
  constructor(id: string) {
    super(`Unknown reservation ${id}`);
    this.name = "ReservationNotFoundError";
  }
}

export function canTransitionReservation(
  from: Reservation["status"],
  to: Reservation["status"],
): boolean {
  return RESERVATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Move a reservation to a new status, enforcing the host-stand flow. Throws
 * ReservationNotFoundError for an unknown or out-of-scope id and
 * ReservationTransitionError for an illegal transition.
 */
export async function setReservationStatus(
  db: TenantDb,
  id: string,
  to: Reservation["status"],
  scope: VisitorScope = SEED_ONLY,
): Promise<Reservation> {
  const current = await getReservation(db, id, scope);
  if (!current) {
    throw new ReservationNotFoundError(id);
  }
  if (current.status === to) return current;
  if (!canTransitionReservation(current.status, to)) {
    throw new ReservationTransitionError(
      `Reservation ${id} cannot move from "${current.status}" to "${to}"`,
    );
  }
  await db.query(
    "UPDATE reservations SET status = $1 WHERE tenant_id = $2 AND id = $3",
    [to, db.tenantId, id],
  );
  return (await getReservation(db, id, scope))!;
}

/** Today as a local YYYY-MM-DD string (matches how reserved_date is stored). */
export function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
