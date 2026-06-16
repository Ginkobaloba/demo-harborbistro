"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RESTAURANT } from "@/lib/restaurant";

const PARTY_SIZES = Array.from({ length: 12 }, (_, i) => i + 1);

function displayTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

export default function ReservationsPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayString);
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [isClosed, setIsClosed] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!date) return;
    setSlotsLoading(true);
    setTime("");
    setError("");
    fetch(`/api/reservations?date=${date}`)
      .then((r) => r.json() as Promise<{ slots: string[]; isClosed: boolean }>)
      .then(({ slots, isClosed }) => {
        setSlots(slots);
        setIsClosed(isClosed);
      })
      .catch(() => {
        setSlots([]);
        setIsClosed(false);
      })
      .finally(() => setSlotsLoading(false));
  }, [date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!time) {
      setError("Please select a time.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email: email || null,
          partySize,
          date,
          time,
          notes: notes || null,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`/reservations/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-harbor-line bg-white px-4 py-2.5 text-harbor-ink placeholder:text-harbor-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-harbor-teal";
  const labelClass = "block text-sm font-medium text-harbor-ink";

  return (
    <main className="mx-auto max-w-site px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-4xl sm:text-5xl">Reserve a Table</h1>
        <p className="mt-3 text-harbor-ink-soft">
          Tables for 1 to 12. Walk-ins always welcome at the bar.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-7">
          {/* Date */}
          <div>
            <label htmlFor="date" className={labelClass}>
              Date
            </label>
            <input
              id="date"
              type="date"
              required
              min={todayString()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Time slots */}
          <div>
            <p className={labelClass}>Time</p>
            {slotsLoading && (
              <p className="mt-2 text-sm text-harbor-ink-soft">
                Checking availability...
              </p>
            )}
            {!slotsLoading && isClosed && (
              <p className="mt-2 rounded-xl bg-harbor-cream-deep px-4 py-3 text-sm text-harbor-ink-soft">
                We are closed on Mondays. Please choose another date.
              </p>
            )}
            {!slotsLoading && !isClosed && slots.length === 0 && (
              <p className="mt-2 rounded-xl bg-harbor-cream-deep px-4 py-3 text-sm text-harbor-ink-soft">
                No availability on this date. Please try a different day, or
                call us at{" "}
                <a
                  href={`tel:${RESTAURANT.phone}`}
                  className="text-harbor-teal"
                >
                  {RESTAURANT.phone}
                </a>
                .
              </p>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTime(s)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      time === s
                        ? "bg-harbor-teal text-harbor-cream"
                        : "border border-harbor-line bg-white text-harbor-ink hover:border-harbor-teal"
                    }`}
                  >
                    {displayTime(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Party size */}
          <div>
            <label htmlFor="partySize" className={labelClass}>
              Party size
            </label>
            <select
              id="partySize"
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className={inputClass}
            >
              {PARTY_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className={inputClass}
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              className={inputClass}
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label htmlFor="email" className={labelClass}>
              Email{" "}
              <span className="font-normal text-harbor-ink-soft">(optional)</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>

          {/* Notes (optional) */}
          <div>
            <label htmlFor="notes" className={labelClass}>
              Special requests{" "}
              <span className="font-normal text-harbor-ink-soft">(optional)</span>
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, celebrations, accessibility needs..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !time || slotsLoading}
            className="w-full rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Reserving..." : "Reserve Table"}
          </button>
        </form>

        {/* Hours / contact info */}
        <div className="mt-12 rounded-2xl bg-harbor-teal-mist p-6 text-sm text-harbor-ink-soft">
          <p className="font-medium text-harbor-ink">Hours</p>
          <ul className="mt-2 space-y-1">
            {RESTAURANT.hours.map((h) => (
              <li key={h.days}>
                <span className="font-medium">{h.days}:</span> {h.hours}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            Questions? Call{" "}
            <a href={`tel:${RESTAURANT.phone}`} className="text-harbor-teal">
              {RESTAURANT.phone}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
