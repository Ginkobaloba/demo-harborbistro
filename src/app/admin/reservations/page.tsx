import Link from "next/link";
import type { Metadata } from "next";
import {
  getAllReservations,
  getReservationsForDate,
  formatTime,
  formatDate,
  todayLocalDate,
} from "@/lib/reservations";
import type { Reservation } from "@/lib/types";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { ReservationActions } from "@/components/admin/ReservationActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin: Reservations",
};

const STATUS_CHIP: Record<string, string> = {
  confirmed: "bg-teal-100 text-teal-800",
  seated: "bg-amber-100 text-amber-800",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_CHIP[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

export default function AdminReservationsPage() {
  const today = todayLocalDate();
  const todays = getReservationsForDate(today);
  const all = getAllReservations();
  const covers = todays
    .filter((r) => r.status !== "cancelled")
    .reduce((n, r) => n + r.partySize, 0);

  return (
    <main className="mx-auto max-w-site px-4 py-10 sm:px-6">
      <AutoRefresh intervalMs={15000} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Reservations</h1>
          <p className="mt-1 text-sm text-harbor-ink-soft">
            {formatDate(today)} &middot; {covers} covers booked &middot;{" "}
            {all.length} total on the books
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/orders" className="text-harbor-teal hover:text-harbor-coral">
            Kitchen
          </Link>
          <Link href="/admin" className="text-harbor-teal hover:text-harbor-coral">
            Admin home
          </Link>
        </nav>
      </div>

      {/* Today's service: the host-stand working set. */}
      <h2 className="mt-8 font-serif text-2xl">Tonight</h2>
      {todays.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-harbor-line bg-white px-4 py-8 text-center text-sm text-harbor-ink-soft shadow-warm">
          No reservations for today.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {todays.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-harbor-line bg-white p-4 shadow-warm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-harbor-teal">
                  {formatTime(r.reservedTime)}
                </span>
                <StatusChip status={r.status} />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="text-harbor-ink-soft">
                  Party of {r.partySize}
                </span>
              </div>
              {r.notes && (
                <p className="mt-1 text-xs italic text-harbor-ink-soft">
                  &ldquo;{r.notes}&rdquo;
                </p>
              )}
              <div className="mt-3 border-t border-harbor-line pt-3">
                <ReservationActions id={r.id} status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* The full book. */}
      <h2 className="mt-12 font-serif text-2xl">All reservations</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-harbor-line bg-white shadow-warm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-harbor-line bg-harbor-cream-deep text-left text-xs font-medium uppercase tracking-wide text-harbor-ink-soft">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-harbor-line">
            {all.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-harbor-ink-soft">
                  No reservations yet.
                </td>
              </tr>
            ) : (
              all.map((r: Reservation) => (
                <tr key={r.id} className="hover:bg-harbor-cream/40">
                  <td className="px-4 py-3 font-mono font-medium text-harbor-teal">
                    {r.id}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDate(r.reservedDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatTime(r.reservedTime)}
                  </td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3 text-center">{r.partySize}</td>
                  <td className="px-4 py-3">
                    <StatusChip status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ReservationActions id={r.id} status={r.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-center text-xs text-harbor-ink-soft">
        <Link href="/" className="hover:text-harbor-teal">
          Back to site
        </Link>
      </p>
    </main>
  );
}
