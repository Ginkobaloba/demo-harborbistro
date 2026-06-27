import Link from "next/link";
import { RESTAURANT } from "@/lib/restaurant";

export const metadata = {
  title: "Private Events | Harbor Bistro",
  description:
    "Harbor Bistro hosts private dinners, celebrations, and corporate events for groups up to 40. Semi-private and full buyout options available.",
};

export default function PrivateEventsPage() {
  return (
    <main>
      {/* Header */}
      <section className="border-b border-harbor-line bg-harbor-cream-deep">
        <div className="mx-auto max-w-site px-6 py-16">
          <h1 className="font-serif text-4xl sm:text-5xl">Private events</h1>
          <p className="mt-3 max-w-lg text-lg text-harbor-ink-soft">
            The full dining room or the back patio, reserved for your group. We
            handle the food; you handle the conversation.
          </p>
        </div>
      </section>

      {/* Options */}
      <section className="mx-auto max-w-site px-6 py-16">
        <h2 className="font-serif text-3xl">Spaces</h2>
        <p className="mt-3 max-w-xl text-harbor-ink-soft">
          Both options include a dedicated server, a set menu designed around
          the evening's best sourcing, and all the restaurant's usual
          hospitality.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {SPACES.map((space) => (
            <div
              key={space.name}
              className="rounded-2xl border border-harbor-line bg-harbor-cream p-8 shadow-warm"
            >
              <h3 className="font-serif text-2xl text-harbor-teal">
                {space.name}
              </h3>
              <p className="mt-1 text-sm text-harbor-coral">{space.capacity}</p>
              <p className="mt-4 leading-relaxed text-harbor-ink-soft">
                {space.description}
              </p>
              <ul className="mt-5 space-y-2 text-sm text-harbor-ink-soft">
                {space.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-harbor-coral">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Menu options */}
      <section className="bg-harbor-teal-mist">
        <div className="mx-auto max-w-site px-6 py-16">
          <h2 className="font-serif text-3xl">How dinner works</h2>
          <p className="mt-3 max-w-xl text-harbor-ink-soft">
            Private events run on a set menu. We do not do buffets. We do not
            do passed trays. We cook a proper dinner.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {HOW.map((step) => (
              <div key={step.title} className="rounded-2xl bg-harbor-cream p-6">
                <p className="text-3xl font-light text-harbor-coral">
                  {step.number}
                </p>
                <h3 className="mt-2 font-serif text-xl">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-harbor-ink-soft">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-site px-6 py-16">
        <h2 className="font-serif text-3xl">Pricing</h2>
        <div className="mt-6 max-w-prose space-y-4 text-harbor-ink-soft">
          <p>
            Pricing is set per person and includes a three-course menu, soft
            beverages, and service. A beverage package with wine and cocktail
            pairings is available at an additional cost. Buyout pricing for the
            full dining room is available on request.
          </p>
          <p>
            We require a 25% deposit to hold a date. The remainder is due the
            week of the event. Cancellations made more than 14 days out receive
            a full deposit refund. Cancellations within 14 days forfeit the
            deposit.
          </p>
          <p>
            Pricing varies by menu, group size, and date. Email or call to get
            a quote for your event.
          </p>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="border-t border-harbor-line bg-harbor-cream-deep">
        <div className="mx-auto max-w-site px-6 py-16 text-center">
          <h2 className="font-serif text-3xl">Inquire about a date</h2>
          <p className="mx-auto mt-3 max-w-md text-harbor-ink-soft">
            We book private events three to six months out. The earlier you
            reach out, the more options we have for you.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href={`mailto:${RESTAURANT.email}?subject=Private%20Event%20Inquiry`}
              className="rounded-full bg-harbor-coral px-8 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
            >
              Email us to inquire
            </a>
            <a
              href={`tel:${RESTAURANT.phone}`}
              className="rounded-full border border-harbor-teal px-8 py-3 font-medium text-harbor-teal transition-colors hover:bg-harbor-teal hover:text-harbor-cream"
            >
              Call {RESTAURANT.phone}
            </a>
          </div>
          <p className="mt-6 text-sm text-harbor-ink-soft">
            For regular reservations (parties up to 12),{" "}
            <Link
              href="/reservations"
              className="text-harbor-teal hover:underline"
            >
              book online here
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}

const SPACES = [
  {
    name: "The Back Room",
    capacity: "Up to 24 guests, semi-private",
    description:
      "A separated dining area at the back of the restaurant with its own entrance from the patio. The rest of the restaurant stays open. Best for birthdays, rehearsal dinners, and smaller corporate dinners where you want the energy of the room without sharing a table with strangers.",
    features: [
      "Dedicated server and busser",
      "Custom menu with dietary accommodations",
      "AV hookup for presentations (screen + HDMI)",
      "Access from the main dining room or the harborside patio",
    ],
  },
  {
    name: "Full Buyout",
    capacity: "Up to 40 guests, exclusive use",
    description:
      "The entire restaurant, front to back, reserved for your group on a Monday or Sunday brunch. The full kitchen team, the full bar, and the whole space. Used for weddings, milestone celebrations, and corporate events where the headcount justifies it.",
    features: [
      "Exclusive use of the full dining room and bar",
      "Full kitchen and bar team",
      "Custom menu -- three to five courses",
      "Optional live acoustic music (additional cost)",
      "Flexible room layout",
    ],
  },
];

const HOW = [
  {
    number: "01",
    title: "Reach out",
    body: "Email or call with your date, group size, and any dietary constraints. We will let you know if the date is available and what the set menu looks like that season.",
  },
  {
    number: "02",
    title: "Confirm and deposit",
    body: "We send a contract with the menu, pricing, and cancellation terms. A 25% deposit holds the date. The rest is due the week of the event.",
  },
  {
    number: "03",
    title: "Show up and eat",
    body: "We handle everything from there. You arrive, your server introduces the menu, and we cook dinner. No catering coordinator, no event runsheet.",
  },
];
