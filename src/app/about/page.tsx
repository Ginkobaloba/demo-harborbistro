import Link from "next/link";
import { RESTAURANT } from "@/lib/restaurant";

export const metadata = {
  title: "Our Story | Harbor Bistro",
  description:
    "Harbor Bistro opened on the Port Meridian harborfront with one idea: cook what the lake and the land do best, and stay out of the way.",
};

export default function AboutPage() {
  return (
    <main>
      {/* Header */}
      <section className="border-b border-harbor-line bg-harbor-cream-deep">
        <div className="mx-auto max-w-site px-6 py-16">
          <h1 className="font-serif text-4xl sm:text-5xl">Our story</h1>
          <p className="mt-4 max-w-xl text-lg text-harbor-ink-soft">
            {RESTAURANT.tagline}
          </p>
        </div>
      </section>

      {/* Philosophy */}
      <section className="mx-auto max-w-site px-6 py-16">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-serif text-3xl">Good fish, honest hours</h2>
            <p className="mt-4 max-w-prose leading-relaxed text-harbor-ink-soft">
              {RESTAURANT.philosophy}
            </p>
            <p className="mt-4 max-w-prose leading-relaxed text-harbor-ink-soft">
              We opened on the Port Meridian harborfront because this is where
              the fish come off the boat. Our menu changes when the catch does.
              The cooks know every farm we buy from by name, and if something
              isn't right, it doesn't go on the plate.
            </p>
          </div>
          <div className="rounded-2xl bg-harbor-teal-mist p-8">
            <h3 className="font-serif text-2xl text-harbor-teal">
              What we stand for
            </h3>
            <ul className="mt-6 space-y-4 text-harbor-ink-soft">
              <li className="flex gap-3">
                <span className="mt-0.5 text-harbor-coral">&#9632;</span>
                <span>
                  <strong className="text-harbor-ink">Local sourcing first.</strong>{" "}
                  If it grows or swims within 150 miles, we start there.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 text-harbor-coral">&#9632;</span>
                <span>
                  <strong className="text-harbor-ink">Short menu.</strong>{" "}
                  We change it before we stretch it. Twelve to fifteen mains on
                  any given night.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 text-harbor-coral">&#9632;</span>
                <span>
                  <strong className="text-harbor-ink">No production.</strong>{" "}
                  The room is comfortable. The service is attentive without
                  being formal. Dress is whatever you wore to work.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 text-harbor-coral">&#9632;</span>
                <span>
                  <strong className="text-harbor-ink">Honest hours.</strong>{" "}
                  Closed Mondays. The kitchen closes when we say it does.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="bg-harbor-teal-mist">
        <div className="mx-auto max-w-site px-6 py-16">
          <h2 className="font-serif text-3xl">The team</h2>
          <p className="mt-3 max-w-xl text-harbor-ink-soft">
            We are a small crew. The people who cook your dinner are the same
            people who sourced the ingredients that morning.
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {TEAM.map((member) => (
              <div key={member.name} className="rounded-2xl bg-harbor-cream p-6">
                <p className="font-serif text-xl text-harbor-teal">
                  {member.name}
                </p>
                <p className="mt-0.5 text-sm text-harbor-coral">{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-harbor-ink-soft">
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-site px-6 py-16 text-center">
        <h2 className="font-serif text-3xl">Come see for yourself</h2>
        <p className="mx-auto mt-3 max-w-md text-harbor-ink-soft">
          Tables fill up on weekends, especially in the summer. A reservation
          takes 90 seconds.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/reservations"
            className="rounded-full bg-harbor-coral px-8 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
          >
            Reserve a Table
          </Link>
          <Link
            href="/menu"
            className="rounded-full border border-harbor-teal px-8 py-3 font-medium text-harbor-teal transition-colors hover:bg-harbor-teal hover:text-harbor-cream"
          >
            See the Menu
          </Link>
        </div>
      </section>
    </main>
  );
}

const TEAM = [
  {
    name: "Marcus Welle",
    role: "Executive Chef & Co-owner",
    bio: "Marcus spent twelve years cooking up and down the Great Lakes coast before opening Harbor Bistro. His style is direct: good technique, better ingredients, and a strong opinion about what does not belong on a plate.",
  },
  {
    name: "Diane Welle",
    role: "Co-owner & General Manager",
    bio: "Diane runs the front of the house and the numbers. She built the sourcing relationships with the farms and the fishing co-op that make the menu possible.",
  },
  {
    name: "Jose Arriaga",
    role: "Sous Chef",
    bio: "Jose came from a family of commercial fishermen on the south shore and joined the Harbor Bistro kitchen three years ago. He leads brunch and runs the weekend line.",
  },
];
