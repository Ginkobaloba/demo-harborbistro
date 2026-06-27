import type { Metadata } from "next";
import Link from "next/link";
import { RESTAURANT } from "@/lib/restaurant";

export const metadata: Metadata = {
  title: "Private Events",
  description:
    "Harbor Bistro hosts oyster hours, seasonal dinners, and full private buyouts on the harborfront. See upcoming events and inquire about your own.",
};

const EVENTS_EMAIL = `mailto:${RESTAURANT.email}?subject=Private%20event%20inquiry`;

type EventCard = {
  name: string;
  when: string;
  price: string;
  body: string;
  cta: { label: string; href: string };
};

const EVENTS: EventCard[] = [
  {
    name: "Dockside Oyster Hour",
    when: "Every Thursday, 4 to 6pm",
    price: "No cover, oysters by the dozen",
    body: "The week's catch shucked to order at the bar, a short list of crisp pours, and the best seat in the house for the boats coming in. First come, first served.",
    cta: { label: "Plan a table", href: "/reservations" },
  },
  {
    name: "Harvest of the Harbor",
    when: "Late October, one seating at 6:30pm",
    price: "$95 per guest, five courses",
    body: "Our autumn tasting dinner: whole roasted fish, the last of the inland farms' tomatoes, brown-butter squash, and a cider dessert. Wine pairing optional. Seats are limited and go quickly.",
    cta: { label: "Reserve your seat", href: EVENTS_EMAIL },
  },
  {
    name: "New Year's Eve by the Water",
    when: "December 31, seatings at 6 and 9pm",
    price: "$120 per guest, four courses",
    body: "A long, unhurried dinner with the harbor lights on the water. The late seating runs straight through midnight with a glass of something cold to toast the turn of the year.",
    cta: { label: "Join the waitlist", href: EVENTS_EMAIL },
  },
  {
    name: "Winter Cioppino Sundays",
    when: "Sunday evenings, January through February",
    price: "$48 per guest, family style",
    body: "When the wind comes off the water, we ladle out big bowls of cioppino with grilled bread and let the table linger. A standing winter series, booked by the table.",
    cta: { label: "Book a table", href: "/reservations" },
  },
];

export default function PrivateEventsPage() {
  return (
    <main>
      {/* Intro */}
      <section className="mx-auto max-w-site px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-harbor-coral">
          Private events
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl sm:text-5xl">
          Gatherings, dinners, and the whole room to yourself
        </h1>
        <p className="mt-5 max-w-prose text-lg text-harbor-ink-soft">
          The harbor is good company. Whether you want four seats at an oyster
          hour or the entire dining room for the night, we will set the table
          and let the water do the rest.
        </p>
      </section>

      {/* Upcoming events */}
      <section className="bg-harbor-cream-deep">
        <div className="mx-auto max-w-site px-6 py-16">
          <h2 className="text-3xl sm:text-4xl">Upcoming events</h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-2">
            {EVENTS.map((ev) => (
              <li
                key={ev.name}
                className="flex flex-col rounded-2xl bg-harbor-cream p-6 shadow-warm"
              >
                <h3 className="font-serif text-2xl">{ev.name}</h3>
                <p className="mt-1 text-sm font-medium text-harbor-coral">
                  {ev.when}
                </p>
                <p className="text-sm text-harbor-ink-soft">{ev.price}</p>
                <p className="mt-3 flex-1 text-harbor-ink-soft">{ev.body}</p>
                <Link
                  href={ev.cta.href}
                  className="mt-5 inline-block self-start rounded-full bg-harbor-teal px-5 py-2.5 text-sm font-medium text-harbor-cream transition-colors hover:bg-harbor-teal-deep"
                >
                  {ev.cta.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Private buyout pitch */}
      <section className="bg-harbor-teal text-harbor-cream">
        <div className="mx-auto grid max-w-site items-center gap-10 px-6 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl text-harbor-cream sm:text-4xl">
              Buy out the bistro
            </h2>
            <p className="mt-4 max-w-prose text-harbor-cream/85">
              Take the whole room for a rehearsal dinner, a company night, or
              a birthday that deserves the water view. We host up to 70 seated
              and 100 for a standing reception, with a menu built around what
              is good that week and a bar that can run as open, hosted, or
              consumption. One coordinator handles the night start to finish.
            </p>
            <ul className="mt-6 space-y-2 text-harbor-cream/85">
              <li>Full dining room and harborfront patio</li>
              <li>Custom family-style or plated menus, dietary needs handled</li>
              <li>Audio, a small stage, and screen for toasts and slideshows</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-harbor-cream p-8 text-harbor-ink shadow-warm">
            <h3 className="font-serif text-2xl">Tell us about your night</h3>
            <p className="mt-2 text-sm text-harbor-ink-soft">
              Send the date, headcount, and the kind of evening you have in
              mind. We usually reply within a day with options and a quote.
            </p>
            <Link
              href={EVENTS_EMAIL}
              className="mt-6 inline-block rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
            >
              Inquire about a buyout
            </Link>
            <p className="mt-4 text-sm text-harbor-ink-soft">
              Prefer to talk it through? Call {RESTAURANT.phone}.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
