import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  CartError,
  attachCheckoutSession,
  createPendingOrder,
  lineDescription,
  priceCart,
} from "@/lib/orders";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { publicOrigin } from "@/lib/origin";
import type { Fulfillment } from "@/lib/types";

// better-sqlite3 and the Stripe SDK both need the Node.js runtime.
export const runtime = "nodejs";

/**
 * POST /api/checkout
 *
 * Body: {
 *   lines: { slug, quantity, selections? }[],
 *   customerName, customerPhone, customerEmail?,
 *   fulfillment: "pickup" | "delivery", deliveryAddress?, tipCents?
 * }
 *
 * Reprices the cart from the menu database (the client never sets prices),
 * persists a pending order, opens a Stripe Checkout Session, and returns the
 * hosted-checkout URL. Returns { url, orderId } (200) or { error } (400/503).
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Online payment is not configured in this environment. Set STRIPE_SECRET_KEY (test mode) to enable checkout.",
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customerName = String(body.customerName ?? "").trim();
  const customerPhone = String(body.customerPhone ?? "").trim();
  const customerEmailRaw = String(body.customerEmail ?? "").trim();
  const fulfillment = body.fulfillment as Fulfillment;
  const deliveryAddress = String(body.deliveryAddress ?? "").trim();
  const tipCents =
    Number.isFinite(Number(body.tipCents)) && Number(body.tipCents) >= 0
      ? Math.round(Number(body.tipCents))
      : 0;

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
    priced = priceCart(body.lines);
  } catch (err) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const order = createPendingOrder({
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    tipCents,
    customerName,
    customerPhone,
    customerEmail: customerEmailRaw || null,
    fulfillment,
    deliveryAddress: fulfillment === "delivery" ? deliveryAddress : null,
  });

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    priced.lines.map((line) => {
      const description = lineDescription(line);
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
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: customerEmailRaw || undefined,
    client_reference_id: order.id,
    metadata: { order_id: order.id, fulfillment },
    payment_intent_data: { metadata: { order_id: order.id } },
    success_url: `${origin}/order/confirmation/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/order?canceled=${order.id}`,
  });

  attachCheckoutSession(order.id, session.id);

  return NextResponse.json({ url: session.url, orderId: order.id });
}
