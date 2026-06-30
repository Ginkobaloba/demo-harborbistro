import { getDb } from "./db";
import { getItemBySlug } from "./menu";
import { newOrderId } from "./ids";
import type {
  Fulfillment,
  MenuItem,
  Order,
  OrderLineItem,
  OrderStatus,
} from "./types";

export const MAX_LINE_QUANTITY = 12;

/** Untrusted cart line from the client. Prices are deliberately NOT accepted. */
export type RawCartLine = {
  slug: string;
  quantity: number;
  selections?: Record<string, string | string[]>;
};

export type PricedCart = {
  lines: OrderLineItem[];
  subtotalCents: number;
};

/** Caller-facing validation error (maps to HTTP 400), distinct from bugs. */
export class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartError";
  }
}

/**
 * Price a single configured line from the menu item. The base price plus any
 * per-choice upcharges. This is the source of truth: the client never sets a
 * price.
 */
export function priceLine(
  item: MenuItem,
  selections: Record<string, string | string[]>,
): number {
  let cents = item.priceCents;
  for (const group of item.customizationOptions) {
    const raw = selections[group.id];
    const chosenIds = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const id of chosenIds) {
      const choice = group.choices.find((c) => c.id === id);
      if (choice?.priceCents) cents += choice.priceCents;
    }
  }
  return cents;
}

/**
 * Validate the raw selections against the item's customization groups and
 * return a canonical selection map. Rejects unknown groups/choices (tamper)
 * and missing required single-choice groups.
 */
function normalizeSelections(
  item: MenuItem,
  raw: Record<string, string | string[]> | undefined,
): Record<string, string | string[]> {
  const input = raw ?? {};
  const out: Record<string, string | string[]> = {};

  for (const key of Object.keys(input)) {
    if (!item.customizationOptions.some((g) => g.id === key)) {
      throw new CartError(`Unknown option group "${key}" for ${item.slug}`);
    }
  }

  for (const group of item.customizationOptions) {
    const value = input[group.id];
    const validId = (id: unknown): id is string =>
      typeof id === "string" && group.choices.some((c) => c.id === id);

    if (group.type === "single") {
      if (value == null || value === "") {
        if (group.required) {
          throw new CartError(`Choose a ${group.label} for ${item.name}`);
        }
        continue;
      }
      if (Array.isArray(value) || !validId(value)) {
        throw new CartError(`Invalid ${group.label} for ${item.name}`);
      }
      out[group.id] = value;
    } else {
      if (value == null) continue;
      const arr = Array.isArray(value) ? value : [value];
      for (const id of arr) {
        if (!validId(id)) {
          throw new CartError(`Invalid ${group.label} for ${item.name}`);
        }
      }
      if (arr.length > 0) out[group.id] = arr;
    }
  }

  return out;
}

/**
 * Reprice a whole cart from the menu database. Throws CartError on an empty
 * cart, unknown items, bad quantities, or invalid selections. Returns clean
 * line items with server-authoritative prices and the subtotal.
 */
export function priceCart(rawLines: unknown): PricedCart {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new CartError("Your cart is empty");
  }

  const lines: OrderLineItem[] = [];
  for (const raw of rawLines as RawCartLine[]) {
    const slug = typeof raw?.slug === "string" ? raw.slug : "";
    const quantity = Number(raw?.quantity);
    if (!slug) throw new CartError("Cart line is missing an item");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw new CartError(`Quantity for ${slug} must be 1 to ${MAX_LINE_QUANTITY}`);
    }
    const item = getItemBySlug(slug);
    if (!item) throw new CartError(`That item is no longer available: ${slug}`);

    const selections = normalizeSelections(item, raw.selections);
    lines.push({
      slug: item.slug,
      name: item.name,
      quantity,
      unitPriceCents: priceLine(item, selections),
      selections,
    });
  }

  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );
  return { lines, subtotalCents };
}

/**
 * Human-readable summary of a line's chosen options, e.g.
 * "Medium rare, Add bacon". Re-derives labels from the menu so it never
 * depends on client-supplied text. Empty string when there are no options.
 */
export function lineDescription(line: OrderLineItem): string {
  const item = getItemBySlug(line.slug);
  if (!item) return "";
  const labels: string[] = [];
  for (const group of item.customizationOptions) {
    const raw = line.selections[group.id];
    const chosenIds = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const id of chosenIds) {
      const choice = group.choices.find((c) => c.id === id);
      if (choice) labels.push(choice.label);
    }
  }
  return labels.join(", ");
}

// --------------------------------------------------------------- persistence

type OrderRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfillment: Fulfillment;
  delivery_address: string | null;
  items: string;
  subtotal_cents: number;
  tip_cents: number;
  total_cents: number;
  status: OrderStatus;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
  updated_at: string;
};

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    fulfillment: row.fulfillment,
    deliveryAddress: row.delivery_address,
    items: JSON.parse(row.items) as OrderLineItem[],
    subtotalCents: row.subtotal_cents,
    tipCents: row.tip_cents,
    totalCents: row.total_cents,
    status: row.status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreateOrderInput = {
  lines: OrderLineItem[];
  subtotalCents: number;
  tipCents: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  fulfillment: Fulfillment;
  deliveryAddress?: string | null;
};

/**
 * Insert an order in the `pending` state, before the customer pays. The
 * customer-facing confirmation and the kitchen only treat an order as real
 * once Stripe confirms payment (status moves to `received`).
 */
export function createPendingOrder(input: CreateOrderInput): Order {
  const id = newOrderId();
  const totalCents = input.subtotalCents + input.tipCents;
  getDb()
    .prepare(
      `INSERT INTO orders (
         id, customer_name, customer_phone, customer_email, fulfillment,
         delivery_address, items, subtotal_cents, tip_cents, total_cents, status
       ) VALUES (
         @id, @customerName, @customerPhone, @customerEmail, @fulfillment,
         @deliveryAddress, @items, @subtotalCents, @tipCents, @totalCents, 'pending'
       )`,
    )
    .run({
      id,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? null,
      fulfillment: input.fulfillment,
      deliveryAddress: input.deliveryAddress ?? null,
      items: JSON.stringify(input.lines),
      subtotalCents: input.subtotalCents,
      tipCents: input.tipCents,
      totalCents,
    });
  return getOrder(id)!;
}

export function getOrder(id: string): Order | null {
  const row = getDb()
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(id) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function getOrderByCheckoutSession(sessionId: string): Order | null {
  const row = getDb()
    .prepare("SELECT * FROM orders WHERE stripe_checkout_session_id = ?")
    .get(sessionId) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function attachCheckoutSession(orderId: string, sessionId: string): void {
  getDb()
    .prepare(
      "UPDATE orders SET stripe_checkout_session_id = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(sessionId, orderId);
}

/**
 * Move a pending order to `received` and record the payment intent. Idempotent:
 * a no-op for an order that already advanced past pending, so the success page
 * and the webhook can both call it safely. Returns the resulting order, or null
 * if the id is unknown.
 */
export function markOrderPaid(
  orderId: string,
  paymentIntentId: string | null,
): Order | null {
  const order = getOrder(orderId);
  if (!order) return null;
  if (order.status === "pending") {
    getDb()
      .prepare(
        `UPDATE orders
           SET status = 'received',
               stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
               updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'`,
      )
      .run(paymentIntentId, orderId);
  }
  return getOrder(orderId);
}

/** Mark a still-pending order cancelled (expired or abandoned checkout). */
export function markOrderCancelled(orderId: string): Order | null {
  getDb()
    .prepare(
      "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
    )
    .run(orderId);
  return getOrder(orderId);
}

// ----------------------------------------------------------- kitchen / operator

/**
 * Statuses a paid order moves through in the kitchen, in order. `pending`
 * (pre-payment) and the terminal `cancelled` are deliberately outside this
 * line: the operator only ever drives a *paid* order forward.
 */
export const ORDER_FLOW = [
  "received",
  "preparing",
  "ready",
  "completed",
] as const;

export type ActiveOrderStatus = "received" | "preparing" | "ready";

/** The live kitchen queue: paid orders not yet completed or cancelled. */
export const ACTIVE_ORDER_STATUSES: ActiveOrderStatus[] = [
  "received",
  "preparing",
  "ready",
];

/**
 * The next status in the kitchen flow, or null if the order is terminal
 * (completed/cancelled) or still awaiting payment. Pure: drives both the
 * operator "advance" button and its server-side validation.
 */
export function nextOrderStatus(current: OrderStatus): OrderStatus | null {
  const idx = (ORDER_FLOW as readonly string[]).indexOf(current);
  if (idx === -1 || idx === ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[idx + 1];
}

/** Raised when an operator action is not legal for the order's current state. */
export class OrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

/**
 * Advance a paid order to the next kitchen status (received -> preparing ->
 * ready -> completed). Throws OrderTransitionError if the order is unknown,
 * unpaid, or already terminal. The status guard in the WHERE clause makes the
 * write idempotent under concurrent operator clicks.
 */
export function advanceOrder(orderId: string): Order {
  const order = getOrder(orderId);
  if (!order) throw new OrderTransitionError(`Unknown order ${orderId}`);
  const next = nextOrderStatus(order.status);
  if (!next) {
    throw new OrderTransitionError(
      `Order ${orderId} cannot advance from "${order.status}"`,
    );
  }
  getDb()
    .prepare(
      `UPDATE orders SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND status = ?`,
    )
    .run(next, orderId, order.status);
  return getOrder(orderId)!;
}

/**
 * Cancel a paid order that has not yet completed. Distinct from
 * markOrderCancelled (which only touches still-`pending` checkouts): this is
 * the operator cancelling an in-progress kitchen order.
 */
export function cancelActiveOrder(orderId: string): Order {
  const order = getOrder(orderId);
  if (!order) throw new OrderTransitionError(`Unknown order ${orderId}`);
  if (!ACTIVE_ORDER_STATUSES.includes(order.status as ActiveOrderStatus)) {
    throw new OrderTransitionError(
      `Order ${orderId} cannot be cancelled from "${order.status}"`,
    );
  }
  getDb()
    .prepare(
      "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?",
    )
    .run(orderId);
  return getOrder(orderId)!;
}

/** Live kitchen queue, oldest first (the order a cook should start next). */
export function getActiveOrders(): Order[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('received','preparing','ready')
       ORDER BY created_at ASC`,
    )
    .all() as OrderRow[];
  return rows.map(rowToOrder);
}

/** Recently finished orders (completed or cancelled), newest first. */
export function getRecentOrders(limit = 25): Order[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('completed','cancelled')
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as OrderRow[];
  return rows.map(rowToOrder);
}

/** Counts per active status for the operator header, e.g. {received: 3, ...}. */
export function getKitchenCounts(): Record<ActiveOrderStatus, number> {
  const rows = getDb()
    .prepare(
      `SELECT status, COUNT(*) c FROM orders
       WHERE status IN ('received','preparing','ready')
       GROUP BY status`,
    )
    .all() as { status: ActiveOrderStatus; c: number }[];
  const counts: Record<ActiveOrderStatus, number> = {
    received: 0,
    preparing: 0,
    ready: 0,
  };
  for (const r of rows) counts[r.status] = r.c;
  return counts;
}
