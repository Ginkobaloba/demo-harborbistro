import Image from "next/image";
import Link from "next/link";
import { getFeaturedItems, formatPrice } from "@/lib/menu";
import { RESTAURANT } from "@/lib/restaurant";

const HERO_URL =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=70";

export default function Home() {
  const featured = getFeaturedItems();

  return (
    <main>
      {/* Hero */}
      <section className="relative flex min-h-[70vh] items-end">
        <Image
          src={HERO_URL}
          alt="The Harbor Bistro dining room at dusk, tables set and candles lit"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-harbor-ink/80 via-harbor-ink/20 to-transparent"
        />
        <div className="relative mx-auto w-full max-w-site px-6 pb-14 pt-40 text-harbor-cream">
          <h1 className="max-w-xl text-balance text-4xl text-harbor-cream sm:text-6xl">
            Dinner by the water, minus the production
          </h1>
          <p className="mt-4 max-w-md text-lg text-harbor-cream/90">
            {RESTAURANT.tagline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/reservations"
              className="rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm-lg transition-colors hover:bg-harbor-coral-deep"
            >
              Reserve a Table
            </Link>
            <Link
              href="/menu"
              className="rounded-full border border-harbor-cream/60 px-6 py-3 font-medium text-harbor-cream transition-colors hover:bg-harbor-cream/10"
            >
              See the Menu
            </Link>
          </div>
        </div>
      </section>

      {/* Hours / location strip */}
      <section className="border-b border-harbor-line bg-harbor-cream-deep">
        <div className="mx-auto flex max-w-site flex-wrap items-center justify-center gap-x-10 gap-y-2 px-6 py-4 text-center text-sm text-harbor-ink-soft">
          <span>
            {RESTAURANT.address.street}, {RESTAURANT.address.city}
          </span>
          <span aria-hidden className="hidden text-harbor-coral sm:inline">
            &#9676;
          </span>
          <span>Tue-Sun from 4pm, Sunday brunch 10am-2pm</span>
          <span aria-hidden className="hidden text-harbor-coral sm:inline">
            &#9676;
          </span>
          <span>{RESTAURANT.phone}</span>
        </div>
      </section>

      {/* This week's menu */}
      <section className="mx-auto max-w-site px-6 py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl">This week&apos;s menu</h2>
            <p className="mt-2 text-harbor-ink-soft">
              A few things the kitchen is proud of right now.
            </p>
          </div>
          <Link
            href="/menu"
            className="hidden whitespace-nowrap text-sm font-medium text-harbor-coral hover:text-harbor-coral-deep sm:inline"
          >
            Full menu &rarr;
          </Link>
        </div>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((item) => (
            <li
              key={item.slug}
              className="overflow-hidden rounded-2xl bg-white/60 shadow-warm"
            >
              <Link href={`/menu/${item.slug}`} className="block">
                {item.photoUrl && (
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={item.photoUrl}
                      alt={item.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-serif text-lg leading-snug">
                      {item.name}
                    </h3>
                    <span className="text-sm text-harbor-ink-soft">
                      {formatPrice(item.priceCents)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-harbor-ink-soft">
                    {item.description}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center sm:hidden">
          <Link
            href="/menu"
            className="text-sm font-medium text-harbor-coral hover:text-harbor-coral-deep"
          >
            Full menu &rarr;
          </Link>
        </p>
      </section>

      {/* Philosophy + reservation CTA */}
      <section className="bg-harbor-teal-mist">
        <div className="mx-auto grid max-w-site items-center gap-10 px-6 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl sm:text-4xl">
              Good fish, short menu, honest hours
            </h2>
            <p className="mt-4 max-w-prose text-harbor-ink-soft">
              {RESTAURANT.philosophy}
            </p>
            <Link
              href="/about"
              className="mt-4 inline-block text-sm font-medium text-harbor-coral hover:text-harbor-coral-deep"
            >
              Our story &rarr;
            </Link>
          </div>
          <div className="rounded-2xl bg-harbor-cream p-8 text-center shadow-warm">
            <h3 className="font-serif text-2xl">Tonight, or two weeks out</h3>
            <p className="mt-2 text-sm text-harbor-ink-soft">
              Tables for 1 to 12. Walk-ins always welcome at the bar.
            </p>
            <Link
              href="/reservations"
              className="mt-6 inline-block rounded-full bg-harbor-teal px-8 py-3 font-medium text-harbor-cream transition-colors hover:bg-harbor-teal-deep"
            >
              Reserve a Table
            </Link>
            <p className="mt-3 text-xs text-harbor-ink-soft">
              Or order pickup and delivery{" "}
              <Link href="/order" className="underline underline-offset-2">
                online
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
