import Link from "next/link";
import type { Metadata } from "next";
import { getAllReservations, formatTime, formatDate } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin: Reservations",
};

const STATUS_CHIP: Record<string, string> = {
  confirmed: "bg-teal-100 text-teal-800",
  seated:    "bg-amber-100 text-amber-800",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminReservationsPage() {
  const reservations = getAllReservations();

  return (
    <main className="mx-auto max-w-site px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl sm:text-4xl">Reservations</h1>
        <span className="text-sm text-harbor-ink-soft">
          {reservations.length} total
        </span>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-harbor-line bg-white shadow-warm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-harbor-line bg-harbor-cream-deep text-left text-xs font-medium uppercase tracking-wide text-harbor-ink-soft">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-harbor-line">
            {reservations.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-harbor-ink-soft"
                >
                  No reservations yet.
                </td>
              </tr>
            ) : (
              reservations.map((r) => (
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
                  <td className="whitespace-nowrap px-4 py-3">{r.phone}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_CHIP[r.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {r.status}
                    </span>
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
