import type { MenuItem } from "@/lib/types";

const BADGES: {
  key: keyof Pick<
    MenuItem,
    "isVegetarian" | "isVegan" | "isGlutenFree" | "containsNuts"
  >;
  short: string;
  label: string;
}[] = [
  { key: "isVegan", short: "VG", label: "Vegan" },
  { key: "isVegetarian", short: "V", label: "Vegetarian" },
  { key: "isGlutenFree", short: "GF", label: "Gluten-free" },
  { key: "containsNuts", short: "N", label: "Contains nuts" },
];

export function DietaryBadges({ item }: { item: MenuItem }) {
  // Vegan implies vegetarian; show only the stronger claim.
  const visible = BADGES.filter(
    (b) => item[b.key] && !(b.key === "isVegetarian" && item.isVegan),
  );
  if (visible.length === 0) return null;
  return (
    <span className="inline-flex gap-1 align-middle">
      {visible.map((b) => (
        <abbr
          key={b.key}
          title={b.label}
          className={`rounded px-1 py-0.5 text-[10px] font-semibold no-underline ${
            b.key === "containsNuts"
              ? "bg-harbor-coral/15 text-harbor-coral-deep"
              : "bg-harbor-teal/10 text-harbor-teal"
          }`}
        >
          {b.short}
        </abbr>
      ))}
    </span>
  );
}
