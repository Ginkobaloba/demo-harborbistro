import type { Metadata } from "next";
import Link from "next/link";
import { RESTAURANT } from "@/lib/restaurant";

export const metadata: Metadata = {
  title: "Visit",
  description:
    "Hours, address, parking, dress code, and the neighborhood around Harbor Bistro on the harborfront.",
};

export default function VisitPage() {
  return (
    <main>
      <section className="mx-auto max-w-site px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-harbor-coral">
          Plan your visit
        </p>
        <h1 className="mt-3 text-4xl sm:text-5xl">Finding us</h1>
        <p className="mt-4 max-w-prose text-lg text-harbor-ink-soft">
          We are on the harborfront in {RESTAURANT.address.city},{" "}
          {RESTAURANT.address.note.toLowerCase()}. Easy to find once you are at
          the water, hard to leave once the sun drops.
        </p>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          {/* Hours */}
          <div>
            <h2 className="text-2xl">Hours</h2>
            <ul className="mt-4 space-y-2 text-harbor-ink-soft">
              {RESTAURANT.hours.map((h) => (
                <li
                  key={h.days}
                  className="flex justify-between gap-6 border-b border-harbor-line/60 pb-2"
                >
                  <span className="font-medium text-harbor-ink">{h.days}</span>
                  <span className="text-right">{h.hours}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-harbor-ink-soft">
              The bar opens 30 minutes before the kitchen and keeps a few seats
              back for walk-ins every night.
            </p>
          </div>

          {/* Address + contact */}
          <div>
            <h2 className="text-2xl">Address</h2>
            <p className="mt-4 text-harbor-ink-soft">
              {RESTAURANT.address.street}
              <br />
              {RESTAURANT.address.city}
            </p>
            <p className="mt-4 text-harbor-ink-soft">
              <span className="font-medium text-harbor-ink">Phone</span>
              <br />
              {RESTAURANT.phone}
            </p>
            <p className="mt-4 text-harbor-ink-soft">
              <span className="font-medium text-harbor-ink">Email</span>
              <br />
              {RESTAURANT.email}
            </p>
          </div>
        </div>
      </section>

      {/* Getting here */}
      <section className="bg-harbor-teal-mist">
        <div className="mx-auto grid max-w-site gap-10 px-6 py-16 md:grid-cols-3">
          <div>
            <h2 className="text-2xl">Parking</h2>
            <p className="mt-3 text-harbor-ink-soft">
              There is a public lot at the foot of Harborline Drive, a short
              walk along the boardwalk, and metered street parking out front
              that frees up after 6pm. Valet runs Friday and Saturday nights.
              On foot, we are five minutes south of the lighthouse pier.
            </p>
          </div>
          <div>
            <h2 className="text-2xl">Dress code</h2>
            <p className="mt-3 text-harbor-ink-soft">
              Come as you are. We mean it. Most guests land somewhere around
              smart-casual, plenty arrive straight off a boat in deck shoes,
              and nobody will blink either way. The only thing we ask is that
              you are comfortable enough to stay for dessert.
            </p>
          </div>
          <div>
            <h2 className="text-2xl">The neighborhood</h2>
            <p className="mt-3 text-harbor-ink-soft">
              The harborfront wakes up slowly and stays out late. Before
              dinner, walk the boardwalk past the working docks; after, the
              lighthouse point is the best spot in {RESTAURANT.address.city} to
              watch the last of the light go pink over the water.
            </p>
          </div>
        </div>
      </section>

      {/* Accessibility + CTA */}
      <section className="mx-auto max-w-site px-6 py-14">
        <h2 className="text-2xl">Accessibility</h2>
        <p className="mt-3 max-w-prose text-harbor-ink-soft">
          The dining room and restrooms are step-free and wheelchair
          accessible, with a ramp at the Harborline Drive entrance and
          accessible parking in the public lot. If you have specific access
          needs or questions about seating, call us at {RESTAURANT.phone} and
          we will make sure the table is ready for you.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/reservations"
            className="rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
          >
            Reserve a Table
          </Link>
          <Link
            href="/menu"
            className="rounded-full border border-harbor-teal/40 px-6 py-3 font-medium text-harbor-teal transition-colors hover:bg-harbor-teal/10"
          >
            See the Menu
          </Link>
        </div>
      </section>
    </main>
  );
}
