import Link from "next/link";
import { RESTAURANT } from "@/lib/restaurant";

export const metadata = {
  title: "Visit | Harbor Bistro",
  description:
    "Harbor Bistro is on the Port Meridian harborfront, two blocks south of the lighthouse. Parking, directions, and accessibility information.",
};

export default function VisitPage() {
  return (
    <main>
      {/* Header */}
      <section className="border-b border-harbor-line bg-harbor-cream-deep">
        <div className="mx-auto max-w-site px-6 py-16">
          <h1 className="font-serif text-4xl sm:text-5xl">Visit us</h1>
          <p className="mt-3 text-lg text-harbor-ink-soft">
            {RESTAURANT.address.note}.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-site px-6 py-16">
        <div className="grid gap-12 md:grid-cols-2">
          {/* Address + Hours */}
          <div className="space-y-8">
            <div>
              <h2 className="font-serif text-2xl">Address</h2>
              <address className="mt-3 not-italic text-harbor-ink-soft">
                <p className="text-lg font-medium text-harbor-ink">
                  {RESTAURANT.name}
                </p>
                <p>{RESTAURANT.address.street}</p>
                <p>{RESTAURANT.address.city}</p>
                <p className="mt-2">
                  <a
                    href={`tel:${RESTAURANT.phone}`}
                    className="text-harbor-teal hover:underline"
                  >
                    {RESTAURANT.phone}
                  </a>
                </p>
                <p>
                  <a
                    href={`mailto:${RESTAURANT.email}`}
                    className="text-harbor-teal hover:underline"
                  >
                    {RESTAURANT.email}
                  </a>
                </p>
              </address>
            </div>

            <div>
              <h2 className="font-serif text-2xl">Hours</h2>
              <ul className="mt-3 space-y-2 text-harbor-ink-soft">
                {RESTAURANT.hours.map((h) => (
                  <li key={h.days} className="flex justify-between gap-4">
                    <span>{h.days}</span>
                    <span className="text-harbor-ink">{h.hours}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-harbor-ink-soft">
                Last seating is 45 minutes before close. The kitchen is busy on
                Friday and Saturday; arriving closer to opening time means a
                quieter experience.
              </p>
            </div>
          </div>

          {/* Directions + Parking */}
          <div className="space-y-8">
            <div className="rounded-2xl bg-harbor-teal-mist p-6">
              <h2 className="font-serif text-2xl">Getting here</h2>

              <div className="mt-4 space-y-5 text-sm leading-relaxed text-harbor-ink-soft">
                <div>
                  <p className="font-medium text-harbor-ink">By car</p>
                  <p className="mt-1">
                    From downtown Port Meridian, take Harbor Boulevard south
                    toward the waterfront. Turn right on Harborline Drive at
                    the lighthouse roundabout. Harbor Bistro is the second
                    building on the left, marked by a navy awning.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-harbor-ink">Parking</p>
                  <p className="mt-1">
                    The Harborfront Public Lot is directly behind the building
                    (entrance off Pier Lane). Two-hour free parking evenings
                    and weekends. A paid surface lot is one block north on
                    Meridian Street for longer stays.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-harbor-ink">By transit</p>
                  <p className="mt-1">
                    Route 12 (Harborfront) stops at Harborline Drive and Pier
                    Lane, one block from the restaurant. Check the Port Meridian
                    Transit schedule for evening service.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-harbor-cream p-6 shadow-warm">
              <h2 className="font-serif text-2xl">Accessibility</h2>
              <ul className="mt-4 space-y-3 text-sm text-harbor-ink-soft">
                <li className="flex gap-2">
                  <span className="text-harbor-coral">&#10003;</span>
                  Step-free entrance on Harborline Drive
                </li>
                <li className="flex gap-2">
                  <span className="text-harbor-coral">&#10003;</span>
                  Accessible restrooms on the main level
                </li>
                <li className="flex gap-2">
                  <span className="text-harbor-coral">&#10003;</span>
                  Reserved accessible parking in the Harborfront Lot
                </li>
                <li className="flex gap-2">
                  <span className="text-harbor-coral">&#10003;</span>
                  Large-print menus available on request
                </li>
                <li className="flex gap-2">
                  <span className="text-harbor-coral">&#10003;</span>
                  Service animals welcome
                </li>
              </ul>
              <p className="mt-5 text-sm text-harbor-ink-soft">
                If you have specific accessibility needs, call us at{" "}
                <a
                  href={`tel:${RESTAURANT.phone}`}
                  className="text-harbor-teal hover:underline"
                >
                  {RESTAURANT.phone}
                </a>{" "}
                before your visit and we will do our best to accommodate you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-harbor-line bg-harbor-teal-mist">
        <div className="mx-auto flex max-w-site flex-wrap items-center justify-between gap-4 px-6 py-8">
          <p className="text-harbor-ink-soft">
            Ready to come in? Reserve a table or browse the menu first.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/reservations"
              className="rounded-full bg-harbor-coral px-6 py-2.5 text-sm font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
            >
              Reserve a Table
            </Link>
            <Link
              href="/menu"
              className="rounded-full border border-harbor-teal px-6 py-2.5 text-sm font-medium text-harbor-teal transition-colors hover:bg-harbor-teal hover:text-harbor-cream"
            >
              See the Menu
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
