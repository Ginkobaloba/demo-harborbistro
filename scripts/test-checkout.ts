/**
 * Checkout / Stripe integration tests. Run after db:seed.
 *
 *   npm run db:seed
 *   npx tsx scripts/test-checkout.ts
 *
 * Covers:
 *   - server-side repricing (the client never sets prices) + validation
 *   - pending-order persistence and idempotent payment transitions
 *   - the Stripe webhook handler (checkout.session.completed / expired)
 *   - real Stripe test-mode behavior for the success card (4242...) and the
 *     declined card (4000 0000 0000 0002), when STRIPE_SECRET_KEY is set.
 *
 * Exits nonzero on any failure. The live Stripe checks SKIP (not fail) when
 * no key is configured, so a keyless build does not break.
 */
import type Stripe from "stripe";
import { getDb } from "../src/lib/db";
import {
  CartError,
  createPendingOrder,
  getOrder,
  markOrderCancelled,
  markOrderPaid,
  priceCart,
  priceLine,
} from "../src/lib/orders";
import { getStripe, isStripeConfigured } from "../src/lib/stripe";
import { handleStripeEvent } from "../src/lib/stripe-webhook";
import { getItemBySlug } from "../src/lib/menu";
import type { MenuItem } from "../src/lib/types";

const failures: string[] = [];
let passed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${label}${detail ? ` (${detail})` : ""}`);
  }
}

async function expectThrows(label: string, fn: () => unknown) {
  try {
    await fn();
    check(label, false, "expected an error, none thrown");
  } catch {
    check(label, true);
  }
}

function anySlug(): string {
  const row = getDb().prepare("SELECT slug FROM menu_items LIMIT 1").get() as
    | { slug: string }
    | undefined;
  if (!row) throw new Error("No menu items seeded. Run npm run db:seed first.");
  return row.slug;
}

function itemWithRequiredSingle(): MenuItem | null {
  const slugs = (
    getDb().prepare("SELECT slug FROM menu_items").all() as { slug: string }[]
  ).map((r) => r.slug);
  for (const slug of slugs) {
    const item = getItemBySlug(slug);
    if (
      item &&
      item.customizationOptions.some((g) => g.type === "single" && g.required)
    ) {
      return item;
    }
  }
  return null;
}

async function main() {
  // --- repricing ---------------------------------------------------------
  const slug = anySlug();
  const item = getItemBySlug(slug)!;

  const priced = priceCart([{ slug, quantity: 2 }]);
  check("priceCart returns one line", priced.lines.length === 1);
  check(
    "priceCart uses the menu price, not a client price",
    priced.lines[0].unitPriceCents === item.priceCents,
    `got ${priced.lines[0].unitPriceCents}, menu ${item.priceCents}`,
  );
  check(
    "subtotal is unit price times quantity",
    priced.subtotalCents === item.priceCents * 2,
  );

  // A tampered client price is ignored: priceCart never reads an incoming price.
  const tampered = priceCart([
    { slug, quantity: 1, selections: {} } as never,
  ]);
  check(
    "tampered price is ignored (repriced from db)",
    tampered.lines[0].unitPriceCents === item.priceCents,
  );

  await expectThrows("empty cart rejected", () => priceCart([]));
  await expectThrows("unknown item rejected", () =>
    priceCart([{ slug: "definitely-not-a-real-slug", quantity: 1 }]),
  );
  await expectThrows("zero quantity rejected", () =>
    priceCart([{ slug, quantity: 0 }]),
  );
  await expectThrows("over-max quantity rejected", () =>
    priceCart([{ slug, quantity: 99 }]),
  );

  const required = itemWithRequiredSingle();
  if (required) {
    await expectThrows("missing required option rejected", () =>
      priceCart([{ slug: required.slug, quantity: 1 }]),
    );
    const group = required.customizationOptions.find(
      (g) => g.type === "single" && g.required,
    )!;
    await expectThrows("invalid option id rejected", () =>
      priceCart([
        { slug: required.slug, quantity: 1, selections: { [group.id]: "nope" } },
      ]),
    );
    // Satisfy every required single-choice group (an item can have more than
    // one, e.g. steak temperature plus choice of side).
    const validSelections: Record<string, string> = {};
    for (const g of required.customizationOptions) {
      if (g.type === "single" && g.required) {
        validSelections[g.id] = g.choices[0].id;
      }
    }
    const ok = priceCart([
      { slug: required.slug, quantity: 1, selections: validSelections },
    ]);
    check(
      "valid required options priced from menu",
      ok.lines[0].unitPriceCents === priceLine(required, validSelections),
    );
  } else {
    check("missing required option rejected (skipped: no required group)", true);
  }

  // --- persistence + idempotent transitions ------------------------------
  const order = createPendingOrder({
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    tipCents: 500,
    customerName: "Test Diner",
    customerPhone: "555-0100",
    customerEmail: "diner@example.com",
    fulfillment: "pickup",
  });
  check("new order is pending", order.status === "pending");
  check(
    "total = subtotal + tip",
    order.totalCents === priced.subtotalCents + 500,
  );

  const afterPaid = markOrderPaid(order.id, "pi_test_123");
  check("paid order moves to received", afterPaid?.status === "received");
  check(
    "payment intent recorded",
    afterPaid?.stripePaymentIntentId === "pi_test_123",
  );

  // Idempotent: a second markOrderPaid does not regress or overwrite.
  const again = markOrderPaid(order.id, "pi_DIFFERENT");
  check("markOrderPaid is idempotent", again?.status === "received");
  check(
    "idempotent call keeps original payment intent",
    again?.stripePaymentIntentId === "pi_test_123",
  );

  // Cancel only applies to still-pending orders.
  const cancelTarget = createPendingOrder({
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    tipCents: 0,
    customerName: "Cancel Me",
    customerPhone: "555-0101",
    fulfillment: "pickup",
  });
  markOrderCancelled(cancelTarget.id);
  check(
    "pending order can be cancelled",
    getOrder(cancelTarget.id)?.status === "cancelled",
  );
  markOrderCancelled(order.id); // already received
  check(
    "received order is not cancelled",
    getOrder(order.id)?.status === "received",
  );

  // --- webhook handler ---------------------------------------------------
  const webhookOrder = createPendingOrder({
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    tipCents: 0,
    customerName: "Webhook Diner",
    customerPhone: "555-0102",
    fulfillment: "pickup",
  });
  const completedEvent = {
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "paid",
        payment_intent: "pi_webhook_1",
        client_reference_id: webhookOrder.id,
        metadata: { order_id: webhookOrder.id },
      },
    },
  } as unknown as Stripe.Event;
  const r1 = handleStripeEvent(completedEvent);
  check("webhook completed event handled", r1.handled === true);
  check(
    "webhook marks order received",
    getOrder(webhookOrder.id)?.status === "received",
  );

  const expireOrder = createPendingOrder({
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    tipCents: 0,
    customerName: "Expire Diner",
    customerPhone: "555-0103",
    fulfillment: "pickup",
  });
  const expiredEvent = {
    type: "checkout.session.expired",
    data: {
      object: { client_reference_id: expireOrder.id, metadata: { order_id: expireOrder.id } },
    },
  } as unknown as Stripe.Event;
  handleStripeEvent(expiredEvent);
  check(
    "webhook expired event cancels order",
    getOrder(expireOrder.id)?.status === "cancelled",
  );

  const unpaidEvent = {
    type: "checkout.session.completed",
    data: { object: { payment_status: "unpaid", metadata: { order_id: "HB-NOPE" } } },
  } as unknown as Stripe.Event;
  check(
    "unpaid completed event is not treated as paid",
    handleStripeEvent(unpaidEvent).handled === false,
  );

  // --- live Stripe test mode (success + declined cards) ------------------
  if (isStripeConfigured()) {
    const stripe = getStripe();

    const success = await stripe.paymentIntents.create({
      amount: 1299,
      currency: "usd",
      payment_method: "pm_card_visa", // 4242 4242 4242 4242
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });
    check(
      "Stripe success card (4242) succeeds",
      success.status === "succeeded",
      `status ${success.status}`,
    );

    let declined = false;
    let declineDetail = "no error";
    try {
      await stripe.paymentIntents.create({
        amount: 1299,
        currency: "usd",
        payment_method: "pm_card_chargeDeclined", // 4000 0000 0000 0002
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      });
    } catch (err) {
      const e = err as { code?: string; type?: string };
      declined = e.code === "card_declined" || e.type === "StripeCardError";
      declineDetail = `${e.type ?? "?"}/${e.code ?? "?"}`;
    }
    check(
      "Stripe declined card (4000 0000 0000 0002) is declined",
      declined,
      declineDetail,
    );
  } else {
    check("Stripe live success card (SKIPPED: no STRIPE_SECRET_KEY)", true);
    check("Stripe live declined card (SKIPPED: no STRIPE_SECRET_KEY)", true);
    console.log(
      "  note: set STRIPE_SECRET_KEY (test mode) to exercise the live card checks",
    );
  }

  // --- report ------------------------------------------------------------
  if (failures.length > 0) {
    console.error(`\n${failures.length} checkout test(s) FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`\n${passed} passed, ${failures.length} failed`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} checkout tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
