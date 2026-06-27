import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { RESTAURANT } from "@/lib/restaurant";

export const metadata: Metadata = {
  title: "About",
  description:
    "The story behind Harbor Bistro: a harborfront kitchen built on fresh fish, small farms, and simple technique.",
};

const STORY_IMG =
  "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1400&q=70";

export default function AboutPage() {
  return (
    <main>
      {/* Intro */}
      <section className="mx-auto max-w-site px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-harbor-coral">
          Our story
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl sm:text-5xl">
          A harborfront kitchen, run like a good weeknight dinner
        </h1>
        <p className="mt-5 max-w-prose text-lg text-harbor-ink-soft">
          {RESTAURANT.philosophy}
        </p>
      </section>

      {/* Founding story */}
      <section className="bg-harbor-teal-mist">
        <div className="mx-auto grid max-w-site items-center gap-10 px-6 py-16 md:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-warm">
            <Image
              src={STORY_IMG}
              alt="Morning light over the harbor, fishing boats at the dock"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div>
            <h2 className="text-3xl sm:text-4xl">How we started</h2>
            <p className="mt-4 max-w-prose text-harbor-ink-soft">
              Harbor Bistro opened in a former chandlery two blocks south of
              the {RESTAURANT.address.city} lighthouse, back when the room
              still smelled faintly of rope and salt. The idea was small and
              stubborn: cook the catch the boats actually bring in, keep the
              menu short enough to do well, and price it so a Tuesday here
              never feels like a special occasion you had to plan around.
            </p>
            <p className="mt-4 max-w-prose text-harbor-ink-soft">
              Years later the room is warmer and the bar is busier, but the
              rule has not moved. We buy what is good that week, we cook it
              plainly, and we let the harbor do most of the talking.
            </p>
          </div>
        </div>
      </section>

      {/* Chef */}
      <section className="mx-auto max-w-site px-6 py-16">
        <div className="grid gap-10 md:grid-cols-[2fr,3fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-harbor-coral">
              In the kitchen
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Chef Mara Quill</h2>
          </div>
          <div>
            <p className="max-w-prose text-harbor-ink-soft">
              Mara cooked up and down the coast before coming home to the
              harbor, with stretches in oyster bars, a fine-dining room she
              left on purpose, and a fish market that taught her more than any
              of them. Her food is restrained and confident: a whole grilled
              fish with nothing to hide behind, brown butter and capers, a
              squeeze of lemon, bread for the plate.
            </p>
            <p className="mt-4 max-w-prose text-harbor-ink-soft">
              She writes the menu around the morning delivery and the small
              farms a short drive inland, which is why your favorite dish might
              vanish for a few weeks and come back better. We think that is the
              point.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-harbor-cream-deep">
        <div className="mx-auto flex max-w-site flex-col items-center gap-4 px-6 py-14 text-center">
          <h2 className="text-3xl sm:text-4xl">Come sit by the water</h2>
          <p className="max-w-md text-harbor-ink-soft">
            Tables for 1 to 12, walk-ins always welcome at the bar.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link
              href="/reservations"
              className="rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
            >
              Reserve a Table
            </Link>
            <Link
              href="/visit"
              className="rounded-full border border-harbor-teal/40 px-6 py-3 font-medium text-harbor-teal transition-colors hover:bg-harbor-teal/10"
            >
              Plan your visit
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
