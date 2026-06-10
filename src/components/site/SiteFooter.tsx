import Link from "next/link";
import { RESTAURANT } from "@/lib/restaurant";

export function SiteFooter() {
  return (
    <footer className="border-t border-harbor-line bg-harbor-teal text-harbor-cream">
      <div className="mx-auto grid max-w-site gap-8 px-6 py-12 sm:grid-cols-3">
        <div>
          <p className="font-serif text-xl text-harbor-cream">Harbor Bistro</p>
          <p className="mt-2 text-sm text-harbor-cream/80">
            {RESTAURANT.tagline}
          </p>
        </div>
        <div className="text-sm">
          <p className="font-medium uppercase tracking-wide text-harbor-cream/60">
            Find us
          </p>
          <p className="mt-2">
            {RESTAURANT.address.street}
            <br />
            {RESTAURANT.address.city}
          </p>
          <p className="mt-2">{RESTAURANT.phone}</p>
        </div>
        <div className="text-sm">
          <p className="font-medium uppercase tracking-wide text-harbor-cream/60">
            Hours
          </p>
          <ul className="mt-2 space-y-1">
            {RESTAURANT.hours.map((h) => (
              <li key={h.days}>
                <span className="text-harbor-cream/70">{h.days}:</span>{" "}
                {h.hours}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link href="/visit" className="underline underline-offset-4">
              Directions, parking & accessibility
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
