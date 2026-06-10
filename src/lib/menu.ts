import { getDb } from "./db";
import {
  COURSES,
  type Course,
  type CustomizationGroup,
  type MenuItem,
} from "./types";

type MenuItemRow = {
  id: number;
  slug: string;
  name: string;
  course: Course;
  description: string;
  price_cents: number;
  photo_url: string | null;
  is_vegetarian: number;
  is_vegan: number;
  is_gluten_free: number;
  contains_nuts: number;
  customization_options: string;
  is_featured: number;
  sort_order: number;
};

function toMenuItem(row: MenuItemRow): MenuItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    course: row.course,
    description: row.description,
    priceCents: row.price_cents,
    photoUrl: row.photo_url,
    isVegetarian: row.is_vegetarian === 1,
    isVegan: row.is_vegan === 1,
    isGlutenFree: row.is_gluten_free === 1,
    containsNuts: row.contains_nuts === 1,
    customizationOptions: JSON.parse(
      row.customization_options,
    ) as CustomizationGroup[],
    isFeatured: row.is_featured === 1,
    sortOrder: row.sort_order,
  };
}

export function getFeaturedItems(): MenuItem[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM menu_items WHERE is_featured = 1 ORDER BY sort_order",
    )
    .all() as MenuItemRow[];
  return rows.map(toMenuItem);
}

export function getMenuByCourse(): Map<Course, MenuItem[]> {
  const rows = getDb()
    .prepare("SELECT * FROM menu_items ORDER BY sort_order")
    .all() as MenuItemRow[];
  const grouped = new Map<Course, MenuItem[]>();
  for (const course of COURSES) grouped.set(course, []);
  for (const row of rows) grouped.get(row.course)!.push(toMenuItem(row));
  return grouped;
}

export function getItemBySlug(slug: string): MenuItem | null {
  const row = getDb()
    .prepare("SELECT * FROM menu_items WHERE slug = ?")
    .get(slug) as MenuItemRow | undefined;
  return row ? toMenuItem(row) : null;
}

export function formatPrice(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}
