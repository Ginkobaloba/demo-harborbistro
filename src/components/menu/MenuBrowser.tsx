"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/menu-format";
import {
  COURSES,
  COURSE_LABELS,
  type Course,
  type MenuItem,
} from "@/lib/types";
import { DietaryBadges } from "./DietaryBadges";

type FilterKey = "vegetarian" | "vegan" | "glutenFree" | "nutFree";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "glutenFree", label: "Gluten-Free" },
  { key: "nutFree", label: "Nut-Free" },
];

function matches(item: MenuItem, active: Set<FilterKey>): boolean {
  if (active.has("vegetarian") && !item.isVegetarian) return false;
  if (active.has("vegan") && !item.isVegan) return false;
  if (active.has("glutenFree") && !item.isGlutenFree) return false;
  if (active.has("nutFree") && item.containsNuts) return false;
  return true;
}

function matchesQuery(item: MenuItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.name.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q)
  );
}

export function MenuBrowser({ items }: { items: MenuItem[] }) {
  const [active, setActive] = useState<Set<FilterKey>>(new Set());
  const [query, setQuery] = useState("");

  function toggle(key: FilterKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Vegan is strictly stronger than vegetarian; don't stack both.
        if (key === "vegan") next.delete("vegetarian");
        if (key === "vegetarian") next.delete("vegan");
      }
      return next;
    });
  }

  const byCourse = useMemo(() => {
    const grouped = new Map<Course, MenuItem[]>();
    for (const course of COURSES) grouped.set(course, []);
    for (const item of items) {
      if (matches(item, active) && matchesQuery(item, query)) {
        grouped.get(item.course)!.push(item);
      }
    }
    return grouped;
  }, [items, active, query]);

  const shownCount = useMemo(
    () => Array.from(byCourse.values()).reduce((n, list) => n + list.length, 0),
    [byCourse],
  );

  const filtering = active.size > 0 || query.trim().length > 0;

  return (
    <div>
      {/* Sticky course nav + dietary filters; sits below the site header. */}
      <div className="sticky top-[57px] z-30 -mx-6 border-b border-harbor-line bg-harbor-cream/95 px-6 py-3 backdrop-blur md:top-[61px]">
        <nav
          aria-label="Courses"
          className="flex gap-4 overflow-x-auto pb-2 text-sm"
        >
          {COURSES.map((course) => (
            <a
              key={course}
              href={`#${course}`}
              className="whitespace-nowrap font-serif text-harbor-teal hover:text-harbor-coral"
            >
              {COURSE_LABELS[course]}
            </a>
          ))}
        </nav>
        <div className="mt-2">
          <label htmlFor="menu-search" className="sr-only">
            Search the menu
          </label>
          <div className="relative">
            <svg
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-harbor-ink-soft"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path
                d="m20 20-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              id="menu-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes, e.g. salmon, oysters, vegan"
              className="w-full rounded-full border border-harbor-line bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-harbor-teal sm:max-w-md"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-harbor-ink-soft hover:text-harbor-teal"
              >
                &times;
              </button>
            )}
          </div>
        </div>
        <div
          role="group"
          aria-label="Dietary filters"
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          {FILTERS.map((f) => {
            const on = active.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "border-harbor-teal bg-harbor-teal text-harbor-cream"
                    : "border-harbor-line bg-transparent text-harbor-ink-soft hover:border-harbor-teal"
                }`}
              >
                {f.label}
              </button>
            );
          })}
          {filtering && (
            <span aria-live="polite" className="text-xs text-harbor-ink-soft">
              {shownCount} of {items.length} dishes
            </span>
          )}
        </div>
      </div>

      {filtering && shownCount === 0 && (
        <p className="py-16 text-center text-harbor-ink-soft">
          No dishes match{query ? ` "${query}"` : " those filters"}. Try a
          different search or clear the filters.
        </p>
      )}

      {COURSES.map((course) => {
        const list = byCourse.get(course)!;
        // While filtering, drop empty courses so results stay tight; otherwise
        // the global empty-state above covers a true no-match.
        if (list.length === 0) return null;
        return (
          <section
            key={course}
            id={course}
            aria-label={COURSE_LABELS[course]}
            className="scroll-mt-36 py-8"
          >
            <h2 className="text-3xl">{COURSE_LABELS[course]}</h2>
            <ul className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
                {list.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/menu/${item.slug}`}
                      className="group flex gap-4"
                    >
                      {item.photoUrl && (
                        <div className="relative hidden h-20 w-24 shrink-0 overflow-hidden rounded-xl sm:block">
                          <Image
                            src={item.photoUrl}
                            alt=""
                            fill
                            sizes="96px"
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <h3 className="font-serif text-lg leading-snug group-hover:text-harbor-coral-deep">
                            {item.name}
                          </h3>
                          <span
                            aria-hidden
                            className="flex-1 border-b border-dotted border-harbor-line"
                          />
                          <span className="text-sm text-harbor-ink-soft">
                            {formatPrice(item.priceCents)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-harbor-ink-soft">
                          {item.description} <DietaryBadges item={item} />
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
          </section>
        );
      })}
    </div>
  );
}
