import type { TenantDb } from "./pg";
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

export async function getFeaturedItems(db: TenantDb): Promise<MenuItem[]> {
  const rows = await db.query<MenuItemRow>(
    "SELECT * FROM menu_items WHERE tenant_id = $1 AND is_featured = 1 ORDER BY sort_order",
    [db.tenantId],
  );
  return rows.map(toMenuItem);
}

export async function getMenuByCourse(db: TenantDb): Promise<Map<Course, MenuItem[]>> {
  const rows = await db.query<MenuItemRow>(
    "SELECT * FROM menu_items WHERE tenant_id = $1 ORDER BY sort_order",
    [db.tenantId],
  );
  const grouped = new Map<Course, MenuItem[]>();
  for (const course of COURSES) grouped.set(course, []);
  for (const row of rows) grouped.get(row.course)!.push(toMenuItem(row));
  return grouped;
}

export async function getAllSlugs(db: TenantDb): Promise<string[]> {
  const rows = await db.query<{ slug: string }>(
    "SELECT slug FROM menu_items WHERE tenant_id = $1 ORDER BY sort_order",
    [db.tenantId],
  );
  return rows.map((row) => row.slug);
}

export async function getItemBySlug(
  db: TenantDb,
  slug: string,
): Promise<MenuItem | null> {
  const rows = await db.query<MenuItemRow>(
    "SELECT * FROM menu_items WHERE tenant_id = $1 AND slug = $2",
    [db.tenantId, slug],
  );
  return rows[0] ? toMenuItem(rows[0]) : null;
}

export { formatPrice } from "./menu-format";
