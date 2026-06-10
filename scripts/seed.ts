/**
 * Creates and seeds data/harborbistro.db from scratch:
 *   60 menu items, 20 sample orders across all statuses, 15 reservations
 *   spread over the next two weeks (relative dates by design, see
 *   docs/decisions.md D-003).
 *
 * Run: npm run db:seed
 */
import fs from "node:fs";
import { getDb, DB_PATH } from "../src/lib/db";
import { newOrderId, newReservationId } from "../src/lib/ids";
import { SEED_MENU } from "../src/data/menu-items";
import type { OrderLineItem, OrderStatus } from "../src/lib/types";

// Fresh database every run.
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
}

const db = getDb();

// ------------------------------------------------------------- menu items

const insertItem = db.prepare(`
  INSERT INTO menu_items (
    slug, name, course, description, price_cents, photo_url,
    is_vegetarian, is_vegan, is_gluten_free, contains_nuts,
    customization_options, is_featured, sort_order
  ) VALUES (
    @slug, @name, @course, @description, @priceCents, @photoUrl,
    @isVegetarian, @isVegan, @isGlutenFree, @containsNuts,
    @customizationOptions, @isFeatured, @sortOrder
  )
`);

db.transaction(() => {
  SEED_MENU.forEach((item, i) => {
    insertItem.run({
      slug: item.slug,
      name: item.name,
      course: item.course,
      description: item.description,
      priceCents: item.priceCents,
      photoUrl: item.photoUrl ?? null,
      isVegetarian: item.isVegetarian ? 1 : 0,
      isVegan: item.isVegan ? 1 : 0,
      isGlutenFree: item.isGlutenFree ? 1 : 0,
      containsNuts: item.containsNuts ? 1 : 0,
      customizationOptions: JSON.stringify(item.customizationOptions ?? []),
      isFeatured: item.isFeatured ? 1 : 0,
      sortOrder: i,
    });
  });
})();

// ------------------------------------------------------------------ orders

const FIRST_NAMES = [
  "Maya", "Theo", "Priya", "Marcus", "Elena", "Sam", "Noor", "Jack",
  "Rosa", "Devon", "Astrid", "Leo", "June", "Omar", "Greta", "Felix",
  "Iris", "Cole", "Nadia", "Pete",
];
const LAST_NAMES = [
  "Lindqvist", "Okafor", "Hansen", "Delgado", "Kowalski", "Brennan",
  "Haddad", "Virtanen", "Moreau", "Schmidt", "Novak", "Reyes",
  "Andersson", "Carter", "Bauer", "Olsen", "Petrov", "Nguyen",
  "Sorensen", "Walsh",
];

const ORDERABLE = SEED_MENU.filter((m) => m.course !== "cocktails");

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function lineItemsFor(seedIndex: number): OrderLineItem[] {
  const count = 1 + (seedIndex % 3); // 1-3 line items
  const items: OrderLineItem[] = [];
  for (let j = 0; j < count; j++) {
    const item = pick(ORDERABLE, seedIndex * 7 + j * 13 + 3);
    const selections: Record<string, string | string[]> = {};
    for (const group of item.customizationOptions ?? []) {
      if (group.type === "single") {
        selections[group.id] = pick(group.choices, seedIndex + j).id;
      }
    }
    items.push({
      slug: item.slug,
      name: item.name,
      quantity: 1 + ((seedIndex + j) % 2),
      unitPriceCents: item.priceCents,
      selections,
    });
  }
  return items;
}

const insertOrder = db.prepare(`
  INSERT INTO orders (
    id, customer_name, customer_phone, customer_email, fulfillment,
    delivery_address, items, subtotal_cents, tip_cents, total_cents,
    status, stripe_payment_intent_id, created_at, updated_at
  ) VALUES (
    @id, @customerName, @customerPhone, @customerEmail, @fulfillment,
    @deliveryAddress, @items, @subtotalCents, @tipCents, @totalCents,
    @status, @stripePaymentIntentId, @createdAt, @updatedAt
  )
`);

// 20 orders: a live kitchen right now plus recent history.
const ORDER_STATUS_PLAN: OrderStatus[] = [
  "received", "received", "received",
  "preparing", "preparing", "preparing", "preparing",
  "ready", "ready", "ready",
  "completed", "completed", "completed", "completed", "completed",
  "completed", "completed", "completed", "completed", "completed",
];

const TIP_RATES = [0, 0.15, 0.18, 0.2, 0.25];

db.transaction(() => {
  ORDER_STATUS_PLAN.forEach((status, i) => {
    const items = lineItemsFor(i);
    const subtotal = items.reduce(
      (sum, li) => sum + li.unitPriceCents * li.quantity,
      0,
    );
    const tip = Math.round(subtotal * pick(TIP_RATES, i));
    // Active orders are minutes old; completed ones spread over 3 days.
    const ageMinutes =
      status === "completed" ? 240 + i * 200 : 4 + i * 9;
    const created = new Date(Date.now() - ageMinutes * 60_000);
    const delivery = i % 4 === 0;
    const name = `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i)}`;

    insertOrder.run({
      id: newOrderId(),
      customerName: name,
      customerPhone: `555-01${String(10 + i)}`,
      customerEmail:
        i % 3 === 0
          ? null
          : `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      fulfillment: delivery ? "delivery" : "pickup",
      deliveryAddress: delivery
        ? `${200 + i * 31} Lakeview Ave, Apt ${1 + (i % 9)}`
        : null,
      items: JSON.stringify(items),
      subtotalCents: subtotal,
      tipCents: tip,
      totalCents: subtotal + tip,
      status,
      stripePaymentIntentId: `pi_demo_${String(i).padStart(3, "0")}`,
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
    });
  });
})();

// ------------------------------------------------------------ reservations

const insertReservation = db.prepare(`
  INSERT INTO reservations (
    id, name, phone, email, party_size, reserved_date, reserved_time,
    notes, status, created_at
  ) VALUES (
    @id, @name, @phone, @email, @partySize, @reservedDate, @reservedTime,
    @notes, @status, @createdAt
  )
`);

const TIMES = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
const NOTES = [
  null,
  "Anniversary -- window table if possible",
  "One highchair please",
  "Gluten-free guest in the party",
  null,
  "Celebrating a graduation",
  null,
  "Quiet corner preferred",
];

db.transaction(() => {
  for (let i = 0; i < 15; i++) {
    const daysOut = 1 + Math.floor((i / 15) * 14); // spread across next 2 weeks
    const date = new Date(Date.now() + daysOut * 24 * 60 * 60_000);
    const name = `${pick(FIRST_NAMES, i + 7)} ${pick(LAST_NAMES, i + 3)}`;
    insertReservation.run({
      id: newReservationId(),
      name,
      phone: `555-02${String(10 + i)}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      partySize: 2 + (i % 7),
      reservedDate: date.toISOString().slice(0, 10),
      reservedTime: pick(TIMES, i * 3),
      notes: pick(NOTES, i),
      status: "confirmed",
      createdAt: new Date(Date.now() - i * 5 * 60 * 60_000).toISOString(),
    });
  }
})();

const counts = {
  menuItems: db.prepare("SELECT COUNT(*) c FROM menu_items").get() as { c: number },
  orders: db.prepare("SELECT COUNT(*) c FROM orders").get() as { c: number },
  reservations: db.prepare("SELECT COUNT(*) c FROM reservations").get() as { c: number },
};

console.log(
  `Seeded ${DB_PATH}: ${counts.menuItems.c} menu items, ` +
    `${counts.orders.c} orders, ${counts.reservations.c} reservations.`,
);
