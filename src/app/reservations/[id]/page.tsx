import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getReservation, formatTime, formatDate } from "@/lib/reservations";
import { RESTAURANT } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservation Confirmed",
};

type Props = { params: { id: string } };

export default function ConfirmationPage({ params }: Props) {
  const reservation = getReservation(params.id);
  if (!reservation) notFound();

  return (
    <main className="mx-auto max-w-site px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-lg">
        {/* Success icon */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-harbor-teal">
            <svg
              aria-hidden
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M5 13l4 4L19 7"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h1 className="mt-6 text-center font-serif text-3xl sm:text-4xl">
          You&apos;re on the books.
        </h1>
        <p className="mt-2 text-center text-harbor-ink-soft">
          We look forward to seeing you.
        </p>

        {/* Booking summary card */}
        <div className="mt-8 rounded-2xl bg-harbor-cream-deep p-6 shadow-warm">
          <div className="mb-5 text-center">
            <span className="rounded-full bg-harbor-teal/10 px-4 py-1.5 font-mono text-sm font-semibold tracking-wider text-harbor-teal">
              {reservation.id}
            </span>
            <p className="mt-1.5 text-xs text-harbor-ink-soft">Booking code</p>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-harbor-ink-soft">Name</dt>
              <dd className="font-medium">{reservation.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-harbor-ink-soft">Date</dt>
              <dd className="font-medium">{formatDate(reservation.reservedDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-harbor-ink-soft">Time</dt>
              <dd className="font-medium">{formatTime(reservation.reservedTime)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-harbor-ink-soft">Party size</dt>
              <dd className="font-medium">
                {reservation.partySize}{" "}
                {reservation.partySize === 1 ? "guest" : "guests"}
              </dd>
            </div>
            {reservation.notes && (
              <div className="flex justify-between gap-6">
                <dt className="shrink-0 text-harbor-ink-soft">Notes</dt>
                <dd className="text-right font-medium">{reservation.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        <p className="mt-6 text-center text-sm text-harbor-ink-soft">
          Need to change your reservation? Call us at{" "}
          <a
            href={`tel:${RESTAURANT.phone}`}
            className="text-harbor-teal hover:text-harbor-teal-deep"
          >
            {RESTAURANT.phone}
          </a>
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/menu"
            className="rounded-full border border-harbor-teal px-6 py-3 text-center text-sm font-medium text-harbor-teal transition-colors hover:bg-harbor-teal hover:text-harbor-cream"
          >
            Browse the menu
          </Link>
          <Link
            href="/"
            className="rounded-full bg-harbor-teal px-6 py-3 text-center text-sm font-medium text-harbor-cream shadow-warm transition-colors hover:bg-harbor-teal-deep"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
