import { getItemBySlug } from "./menu";
import { newOrderId } from "./ids";
import { SEED_ONLY, scopeSql, type VisitorScope } from "./visitor";
import type { TenantDb } from "./pg";
import type {
  Fulfillment,
  MenuItem,
  Order,
  OrderLineItem,
  OrderStatus,
} from "./types";

export const MAX_LINE_QUANTITY = 12;
// Tip rules live in ./tip (pure, shared with the order form).
export { MAX_TIP_CENTS, maxTipCents, parseTipCents } from "./tip";
/** Distinct cart lines per order; bounds the pricing work one request can cause. */
export const MAX_CART_LINES = 50;

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
      // De-duplicated: each add-on is chosen (and charged) at most once.
      const arr = [...new Set(Array.isArray(value) ? value : [value])];
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
export async function priceCart(
  db: TenantDb,
  rawLines: unknown,
): Promise<PricedCart> {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new CartError("Your cart is empty");
  }
  if (rawLines.length > MAX_CART_LINES) {
    throw new CartError(`A single order can hold at most ${MAX_CART_LINES} lines`);
  }

  const lines: OrderLineItem[] = [];
  for (const raw of rawLines as RawCartLine[]) {
    const slug = typeof raw?.slug === "string" ? raw.slug : "";
    const quantity = Number(raw?.quantity);
    if (!slug) throw new CartError("Cart line is missing an item");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw new CartError(`Quantity for ${slug} must be 1 to ${MAX_LINE_QUANTITY}`);
    }
    const item = await getItemBySlug(db, slug);
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
export async function lineDescription(
  db: TenantDb,
  line: OrderLineItem,
): Promise<string> {
  const item = await getItemBySlug(db, line.slug);
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
  /** Pre-minted id (see unusedOrderId). Minted here when omitted. */
  id?: string;
  /** Stripe Checkout Session id, when the session was opened before the insert. */
  stripeCheckoutSessionId?: string | null;
  lines: OrderLineItem[];
  subtotalCents: number;
  tipCents: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  fulfillment: Fulfillment;
  deliveryAddress?: string | null;
  /** The creating browser's visitor id (D-016). Required: no untagged rows. */
  visitorId: string;
};

/**
 * Insert an order in the `pending` state, before the customer pays. The
 * customer-facing confirmation and the kitchen only treat an order as real
 * once Stripe confirms payment (status moves to `received`).
 */
export async function createPendingOrder(
  db: TenantDb,
  input: CreateOrderInput,
): Promise<Order> {
  const id = input.id ?? newOrderId();
  const totalCents = input.subtotalCents + input.tipCents;
  // POSITIONAL, not named. better-sqlite3 took @name parameters; Postgres has
  // only $n, so the binding ORDER is now load-bearing and a reordered column
  // list silently writes values into the wrong columns.
  await db.query(
    `INSERT INTO orders (
       tenant_id, id, customer_name, customer_phone, customer_email, fulfillment,
       delivery_address, items, subtotal_cents, tip_cents, total_cents, status,
       stripe_checkout_session_id, visitor_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13)`,
    [
      db.tenantId,
      id,
      input.customerName,
      input.customerPhone,
      input.customerEmail ?? null,
      input.fulfillment,
      input.deliveryAddress ?? null,
      JSON.stringify(input.lines),
      input.subtotalCents,
      input.tipCents,
      totalCents,
      input.stripeCheckoutSessionId ?? null,
      input.visitorId,
    ],
  );
  return (await getOrderUnscoped(db, id))!;
}

/**
 * Mint an order id no existing row uses. Checkout mints the id before it
 * opens the Stripe session (the session carries it) and inserts the row only
 * afterwards (D-017), so it checks for a collision up front rather than
 * letting the later insert fail on the primary key.
 */
export async function unusedOrderId(db: TenantDb): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = newOrderId();
    const hit = await db.query(
      "SELECT 1 FROM orders WHERE tenant_id = $1 AND id = $2",
      [db.tenantId, id],
    );
    if (hit.length === 0) return id;
  }
  throw new Error("Could not mint an unused order id");
}

/**
 * Look up an order by id with no visitor scoping. Only for the Stripe
 * reconciliation paths (webhook, checkout bookkeeping), which are keyed by
 * ids Stripe hands back and carry no browser cookie. Never feed the result
 * to a page or API response that a visitor can reach.
 */
async function getOrderUnscoped(db: TenantDb, id: string): Promise<Order | null> {
  // "Unscoped" means unscoped BY VISITOR. It is still scoped by TENANT, both
  // by RLS and by the predicate below. Those are different dimensions, and
  // dropping the tenant here would reach across customers rather than across
  // browsers.
  const rows = await db.query<OrderRow>(
    "SELECT * FROM orders WHERE tenant_id = $1 AND id = $2",
    [db.tenantId, id],
  );
  return rows[0] ? rowToOrder(rows[0]) : null;
}

/**
 * Look up an order the caller is allowed to see: a seed order or one created
 * by the caller's own browser (D-016). Returns null for an unknown id and for
 * another visitor's order alike, so callers cannot tell the two apart.
 */
export async function getOrder(
  db: TenantDb,
  id: string,
  scope: VisitorScope = SEED_ONLY,
): Promise<Order | null> {
  const params: unknown[] = [db.tenantId, id];
  const visitor = scopeSql(scope, params);
  const rows = await db.query<OrderRow>(
    `SELECT * FROM orders WHERE tenant_id = $1 AND id = $2 AND ${visitor}`,
    params,
  );
  return rows[0] ? rowToOrder(rows[0]) : null;
}

export async function attachCheckoutSession(
  db: TenantDb,
  orderId: string,
  sessionId: string,
): Promise<void> {
  // The same expression as the column DEFAULT, deliberately: an UPDATED row
  // must carry the same timestamp FORMAT as a CREATED one, or two shapes
  // diverge inside a single column (trap 8).
  await db.query(
    `UPDATE orders SET stripe_checkout_session_id = $1, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
      WHERE tenant_id = $2 AND id = $3`,
    [sessionId, db.tenantId, orderId],
  );
}

/**
 * Move a pending order to `received` and record the payment intent. Idempotent:
 * a no-op for an order that already advanced past pending, so the success page
 * and the webhook can both call it safely. Returns the resulting order, or null
 * if the id is unknown.
 */
export async function markOrderPaid(
  db: TenantDb,
  orderId: string,
  paymentIntentId: string | null,
): Promise<Order | null> {
  const order = await getOrderUnscoped(db, orderId);
  if (!order) return null;
  if (order.status === "pending") {
    // The `AND status = 'pending'` guard is what makes this idempotent, so the
    // success page and the webhook can both call it. Keep it.
    await db.query(
      `UPDATE orders
          SET status = 'received',
              stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id),
              updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
        WHERE tenant_id = $2 AND id = $3 AND status = 'pending'`,
      [paymentIntentId, db.tenantId, orderId],
    );
  }
  return getOrderUnscoped(db, orderId);
}

/** Mark a still-pending order cancelled (expired or abandoned checkout). */
export async function markOrderCancelled(
  db: TenantDb,
  orderId: string,
): Promise<Order | null> {
  await db.query(
    `UPDATE orders SET status = 'cancelled', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
      WHERE tenant_id = $1 AND id = $2 AND status = 'pending'`,
    [db.tenantId, orderId],
  );
  return getOrderUnscoped(db, orderId);
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
 * Raised when the order is unknown or belongs to another visitor. Routes map
 * it to 404 (never 409), so an out-of-scope id is indistinguishable from a
 * missing one.
 */
export class OrderNotFoundError extends OrderTransitionError {
  constructor(orderId: string) {
    super(`Unknown order ${orderId}`);
    this.name = "OrderNotFoundError";
  }
}

/**
 * Advance a paid order to the next kitchen status (received -> preparing ->
 * ready -> completed). Throws OrderTransitionError if the order is unknown,
 * unpaid, or already terminal. The status guard in the WHERE clause makes the
 * write idempotent under concurrent operator clicks.
 */
export async function advanceOrder(
  db: TenantDb,
  orderId: string,
  scope: VisitorScope = SEED_ONLY,
): Promise<Order> {
  const order = await getOrder(db, orderId, scope);
  if (!order) throw new OrderNotFoundError(orderId);
  const next = nextOrderStatus(order.status);
  if (!next) {
    throw new OrderTransitionError(
      `Order ${orderId} cannot advance from "${order.status}"`,
    );
  }
  // The `AND status = $4` guard is what makes this idempotent under concurrent
  // operator clicks: the second click matches no row instead of skipping a
  // state. Postgres runs those clicks concurrently where SQLite serialised
  // them, so the guard matters more here, not less.
  await db.query(
    `UPDATE orders SET status = $1, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
      WHERE tenant_id = $2 AND id = $3 AND status = $4`,
    [next, db.tenantId, orderId, order.status],
  );
  return (await getOrderUnscoped(db, orderId))!;
}

/**
 * Cancel a paid order that has not yet completed. Distinct from
 * markOrderCancelled (which only touches still-`pending` checkouts): this is
 * the operator cancelling an in-progress kitchen order.
 */
export async function cancelActiveOrder(
  db: TenantDb,
  orderId: string,
  scope: VisitorScope = SEED_ONLY,
): Promise<Order> {
  const order = await getOrder(db, orderId, scope);
  if (!order) throw new OrderNotFoundError(orderId);
  if (!ACTIVE_ORDER_STATUSES.includes(order.status as ActiveOrderStatus)) {
    throw new OrderTransitionError(
      `Order ${orderId} cannot be cancelled from "${order.status}"`,
    );
  }
  await db.query(
    `UPDATE orders SET status = 'cancelled', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
      WHERE tenant_id = $1 AND id = $2`,
    [db.tenantId, orderId],
  );
  return (await getOrderUnscoped(db, orderId))!;
}

/**
 * Live kitchen queue, oldest first (the order a cook should start next).
 * Scoped to seed orders plus the caller's own (D-016).
 */
export async function getActiveOrders(
  db: TenantDb,
  scope: VisitorScope = SEED_ONLY,
): Promise<Order[]> {
  const params: unknown[] = [db.tenantId];
  const visitor = scopeSql(scope, params);
  const rows = await db.query<OrderRow>(
    `SELECT * FROM orders
      WHERE tenant_id = $1 AND status IN ('received','preparing','ready') AND ${visitor}
      ORDER BY created_at ASC`,
    params,
  );
  return rows.map(rowToOrder);
}

/** Recently finished orders (completed or cancelled), newest first. Scoped. */
export async function getRecentOrders(
  db: TenantDb,
  scope: VisitorScope = SEED_ONLY,
  limit = 25,
): Promise<Order[]> {
  const params: unknown[] = [db.tenantId];
  const visitor = scopeSql(scope, params);
  params.push(limit);
  const rows = await db.query<OrderRow>(
    `SELECT * FROM orders
      WHERE tenant_id = $1 AND status IN ('completed','cancelled') AND ${visitor}
      ORDER BY updated_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map(rowToOrder);
}

/** Counts per active status for the operator header, e.g. {received: 3, ...}. Scoped. */
export async function getKitchenCounts(
  db: TenantDb,
  scope: VisitorScope = SEED_ONLY,
): Promise<Record<ActiveOrderStatus, number>> {
  const params: unknown[] = [db.tenantId];
  const visitor = scopeSql(scope, params);
  // COUNT(*) is int8, which node-postgres returns as a STRING. ::int keeps the
  // arithmetic below working on numbers rather than concatenating strings.
  const rows = await db.query<{ status: ActiveOrderStatus; c: number }>(
    `SELECT status, COUNT(*)::int c FROM orders
      WHERE tenant_id = $1 AND status IN ('received','preparing','ready') AND ${visitor}
      GROUP BY status`,
    params,
  );
  const counts: Record<ActiveOrderStatus, number> = {
    received: 0,
    preparing: 0,
    ready: 0,
  };
  for (const r of rows) counts[r.status] = r.c;
  return counts;
}
