import Link from "next/link";
import { CartButton } from "@/components/cart/CartButton";

const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/reserve", label: "Reserve" },
  { href: "/about", label: "About" },
  { href: "/visit", label: "Visit" },
  { href: "/private-events", label: "Private Events" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-harbor-line bg-harbor-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-site items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-serif text-2xl text-harbor-teal"
        >
          <svg
            aria-hidden
            width="22"
            height="22"
            viewBox="0 0 48 48"
            fill="none"
            className="text-harbor-coral"
          >
            <path
              d="M24 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 8v24M10 28c0 9 6.5 12 14 12s14-3 14-12M14 24l-4 4 4 4M34 24l4 4-4 4"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Harbor Bistro
        </Link>
        <nav
          aria-label="Main"
          className="hidden items-center gap-5 text-sm md:flex"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-harbor-ink-soft transition-colors hover:text-harbor-teal"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/order"
            className="rounded-full bg-harbor-coral px-4 py-2 text-sm font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
          >
            Order Online
          </Link>
          <CartButton />
        </div>
      </div>
      <nav
        aria-label="Main, compact"
        className="flex gap-4 overflow-x-auto border-t border-harbor-line/60 px-4 py-2 text-sm md:hidden"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap text-harbor-ink-soft hover:text-harbor-teal"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
