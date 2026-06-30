import Link from "next/link";
import type { Metadata } from "next";
import { getKitchenCounts } from "@/lib/orders";
import {
  getReservationsForDate,
  todayLocalDate,
} from "@/lib/reservations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminHomePage() {
  const counts = getKitchenCounts();
  const activeOrders = counts.received + counts.preparing + counts.ready;
  const todays = getReservationsForDate(todayLocalDate());
  const upcomingToday = todays.filter(
    (r) => r.status === "confirmed" || r.status === "seated",
  ).length;

  return (
    <main className="mx-auto max-w-site px-4 py-12 sm:px-6">
      <h1 className="font-serif text-3xl sm:text-4xl">Operator</h1>
      <p className="mt-2 text-harbor-ink-soft">
        Harbor Bistro back-of-house. Orders and reservations are a live source
        of truth, backed by the same database the guest site writes to.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Link
          href="/admin/orders"
          className="group rounded-2xl border border-harbor-line bg-white p-6 shadow-warm transition-colors hover:border-harbor-teal"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl text-harbor-teal">Kitchen</h2>
            <span className="rounded-full bg-harbor-coral px-3 py-1 text-sm font-semibold text-white">
              {activeOrders} active
            </span>
          </div>
          <p className="mt-2 text-sm text-harbor-ink-soft">
            {counts.received} received &middot; {counts.preparing} preparing
            &middot; {counts.ready} ready. Advance orders through the line.
          </p>
        </Link>

        <Link
          href="/admin/reservations"
          className="group rounded-2xl border border-harbor-line bg-white p-6 shadow-warm transition-colors hover:border-harbor-teal"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl text-harbor-teal">
              Reservations
            </h2>
            <span className="rounded-full bg-harbor-teal px-3 py-1 text-sm font-semibold text-white">
              {upcomingToday} today
            </span>
          </div>
          <p className="mt-2 text-sm text-harbor-ink-soft">
            Seat, complete, or cancel today&rsquo;s bookings and see the full
            upcoming list.
          </p>
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-harbor-ink-soft">
        <Link href="/" className="hover:text-harbor-teal">
          Back to guest site
        </Link>
      </p>
    </main>
  );
}
