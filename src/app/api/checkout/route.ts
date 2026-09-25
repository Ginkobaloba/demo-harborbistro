import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  CartError,
  createPendingOrder,
  lineDescription,
  parseTipCents,
  priceCart,
  unusedOrderId,
} from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { checkStripeTestMode } from "@/lib/stripe-mode";
import { publicOrigin } from "@/lib/origin";
import {
  BODY_LIMITS,
  FIELD_LIMITS,
  asRecord,
  readJsonBody,
  textField,
} from "@/lib/request-body";
import {
  VISITOR_SIGNING_UNAVAILABLE,
  isVisitorSigningConfigured,
  visitorCookieAttributes,
  visitorIdForWrite,
} from "@/lib/visitor";
import type { Fulfillment } from "@/lib/types";
import { withCurrentTenant } from "@/lib/tenant";

// better-sqlite3 and the Stripe SDK both need the Node.js runtime.
export const runtime = "nodejs";

const ORDER_NOT_SAVED = "Your order could not be saved. Please try again.";

/** Log a persistence failure by order id and error class only (no PII). */
function logSaveFailure(orderId: string, err: unknown): void {
  console.error(
    `[checkout] could not save order ${orderId}: ${String((err as { name?: unknown })?.name ?? "Error")}`,
  );
}

const PAYMENT_UNAVAILABLE =
  "The payment service is temporarily unavailable, so your order was not placed. Please try again in a moment.";

/**
 * POST /api/checkout
 *
 * Body: {
 *   lines: { slug, quantity, selections? }[],
 *   customerName, customerPhone, customerEmail?,
 *   fulfillment: "pickup" | "delivery", deliveryAddress?,
 *   tipCents? (non-negative integer, at most max($1,000, subtotal))
 * }
 *
 * Reprices the cart from the menu database (the client never sets prices),
 * opens a Stripe Checkout Session, and only then persists the pending order
 * (D-017), returning the hosted-checkout URL. Returns { url, orderId } (200)
 * or { error } (400 bad input, 413 body over the cap, 503 Stripe unavailable
 * or not configured, or SESSION_SECRET unusable so no visitor can be signed,
 * D-018). A 503 leaves no order row and no Stripe session.
 */
export async function POST(req: NextRequest) {
  const stripeMode = checkStripeTestMode(process.env);
  if (!stripeMode.ok) {
    if (stripeMode.reason === "not_test_mode") console.error(`[checkout] ${stripeMode.message}`);
    return NextResponse.json(
      {
        error:
          stripeMode.reason === "not_test_mode"
            ? "Online payment is disabled: this demo only runs with Stripe test-mode keys."
            : "Online payment is not configured in this environment. Set STRIPE_SECRET_KEY (test mode) to enable checkout.",
      },
      { status: 503 },
    );
  }

  // No usable SESSION_SECRET: no visitor can be signed, so the order could
  // never be found again. Refuse before any Stripe work (D-018).
  if (!isVisitorSigningConfigured()) {
    return NextResponse.json({ error: VISITOR_SIGNING_UNAVAILABLE }, { status: 503 });
  }

  const read = await readJsonBody(req, BODY_LIMITS.checkout);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = asRecord(read.body);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fields = {
    customerName: textField(body.customerName, "Name", FIELD_LIMITS.name),
    customerPhone: textField(body.customerPhone, "Phone", FIELD_LIMITS.phone),
    customerEmail: textField(body.customerEmail, "Email", FIELD_LIMITS.email),
    deliveryAddress: textField(body.deliveryAddress, "Delivery address", FIELD_LIMITS.address),
  };
  for (const field of Object.values(fields)) {
    if (!field.ok) return NextResponse.json({ error: field.error }, { status: 400 });
  }
  const value = (f: (typeof fields)[keyof typeof fields]) => (f.ok ? f.value : "");
  const customerName = value(fields.customerName);
  const customerPhone = value(fields.customerPhone);
  const customerEmailRaw = value(fields.customerEmail);
  const deliveryAddress = value(fields.deliveryAddress);
  const fulfillment = body.fulfillment as Fulfillment;

  if (!customerName || !customerPhone) {
    return NextResponse.json(
      { error: "Name and phone are required" },
      { status: 400 },
    );
  }
  if (fulfillment !== "pickup" && fulfillment !== "delivery") {
    return NextResponse.json(
      { error: "Choose pickup or delivery" },
      { status: 400 },
    );
  }
  if (fulfillment === "delivery" && !deliveryAddress) {
    return NextResponse.json(
      { error: "A delivery address is required for delivery" },
      { status: 400 },
    );
  }

  let priced;
  try {
    priced = await withCurrentTenant((db) => priceCart(db, body.lines));
  } catch (err) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // The tip limit scales with the server-priced subtotal (see lib/tip.ts).
  const tip = parseTipCents(body.tipCents, priced.subtotalCents);
  if (!tip.ok) return NextResponse.json({ error: tip.error }, { status: 400 });
  const tipCents = tip.value;

  // Tag the order with this browser's visitor id so only this browser (and
  // no other visitor) can see it in the admin views and confirmation (D-016).
  // An unsigned or tampered cookie is never adopted: a fresh signed visitor
  // is minted instead (D-018). Resolved before the Stripe call, so a refusal
  // here never strands a session.
  const visitor = await visitorIdForWrite(req);
  if (!visitor.ok) {
    return NextResponse.json({ error: VISITOR_SIGNING_UNAVAILABLE }, { status: 503 });
  }

  // The order row is written only AFTER Stripe hands back a session (D-017).
  // The id is minted first because the session needs it (client reference,
  // metadata, success/cancel URLs); nothing touches the database until the
  // session exists, so a Stripe failure leaves no row behind.
  let orderId: string;
  try {
    orderId = await withCurrentTenant((db) => unusedOrderId(db));
  } catch (err) {
    logSaveFailure("(unminted)", err);
    return NextResponse.json({ error: ORDER_NOT_SAVED }, { status: 500 });
  }

  // Descriptions are resolved in ONE transaction BEFORE the Stripe call, not
  // per line inside the map: a transaction must never be held across a network
  // round trip, and Stripe's is the slowest thing in this handler.
  const descriptions = await withCurrentTenant(async (db) => {
    const out = new Map<string, string>();
    for (const line of priced.lines) {
      out.set(line.slug, await lineDescription(db, line));
    }
    return out;
  });

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    priced.lines.map((line) => {
      const description = descriptions.get(line.slug) ?? "";
      return {
        quantity: line.quantity,
        price_data: {
          currency: "usd",
          unit_amount: line.unitPriceCents,
          product_data: {
            name: line.name,
            ...(description ? { description } : {}),
          },
        },
      };
    });

  if (tipCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: tipCents,
        product_data: { name: "Tip" },
      },
    });
  }

  const origin = publicOrigin(req);

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: customerEmailRaw || undefined,
      client_reference_id: orderId,
      metadata: { order_id: orderId, fulfillment },
      payment_intent_data: { metadata: { order_id: orderId } },
      success_url: `${origin}/order/confirmation/${orderId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order?canceled=${orderId}`,
    });
    if (!session.url) throw new Error("Stripe returned a session without a hosted URL");
  } catch (err) {
    // Log the error class and Stripe's own code for the operator; the client
    // gets a fixed message and never any error internals.
    const e = err as { name?: unknown; type?: unknown; code?: unknown };
    console.error(
      `[checkout] Stripe session create failed: ${String(e?.type ?? e?.name ?? "Error")}${
        e?.code ? ` (${String(e.code)})` : ""
      }`,
    );
    return NextResponse.json({ error: PAYMENT_UNAVAILABLE }, { status: 503 });
  }

  let order;
  try {
    // A SEPARATE transaction, after Stripe. D-017 requires the row to be
    // written only once the session exists, so a Stripe failure leaves nothing
    // behind -- and holding the earlier read transaction open across that call
    // would have tied up a pooled client for the duration of a third-party API.
    order = await withCurrentTenant((db) =>
      createPendingOrder(db, {
        id: orderId,
        stripeCheckoutSessionId: session.id,
        lines: priced.lines,
        subtotalCents: priced.subtotalCents,
      tipCents,
      customerName,
      customerPhone,
        customerEmail: customerEmailRaw || null,
      fulfillment,
        deliveryAddress: fulfillment === "delivery" ? deliveryAddress : null,
        visitorId: visitor.visitorId,
      }),
    );
  } catch (err) {
    // The session exists but the row could not be written. The unused test
    // session simply expires at Stripe; the client gets a JSON error, not an
    // empty 500.
    logSaveFailure(orderId, err);
    return NextResponse.json({ error: ORDER_NOT_SAVED }, { status: 500 });
  }

  const res = NextResponse.json({ url: session.url, orderId: order.id });
  if (visitor.cookieValue) {
    res.cookies.set({ ...visitorCookieAttributes(), value: visitor.cookieValue });
  }
  return res;
}
