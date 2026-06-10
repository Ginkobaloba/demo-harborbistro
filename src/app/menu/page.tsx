import type { Metadata } from "next";
import { getMenuByCourse } from "@/lib/menu";
import { MenuBrowser } from "@/components/menu/MenuBrowser";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Harbor Bistro's full menu: snacks, salads, entrees, sides, desserts, drinks, and cocktails. Coastal-American cooking with vegetarian, vegan, and gluten-free options throughout.",
};

export default function MenuPage() {
  const items = Array.from(getMenuByCourse().values()).flat();

  return (
    <main className="mx-auto max-w-site px-6 pb-16">
      <header className="py-10">
        <h1 className="text-4xl sm:text-5xl">The Menu</h1>
        <p className="mt-3 max-w-prose text-harbor-ink-soft">
          Everything below is cooked to order. Tell your server about
          allergies; the kitchen takes them seriously. Menu shifts with the
          seasons and the catch.
        </p>
      </header>
      <MenuBrowser items={items} />
    </main>
  );
}
