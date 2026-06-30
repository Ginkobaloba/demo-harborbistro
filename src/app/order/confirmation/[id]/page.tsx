import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { formatPrice } from "@/lib/menu-format";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { getOrder, lineDescription, markOrderPaid } from "@/lib/orders";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { OrderTracker } from "@/components/order/OrderTracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order Confirmation",
};

type Props = {
  params: { id: string };
  searchParams: { session_id?: string };
};

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: Props) {
  let order = getOrder(params.id);
  if (!order) notFound();

  // Safety net: reconcile against Stripe in case the webhook is delayed or not
  // configured. Idempotent, and scoped to this order's own session.
  if (
    order.status === "pending" &&
    searchParams.session_id &&
    isStripeConfigured()
  ) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(
        searchParams.session_id,
      );
      const belongs =
        session.metadata?.order_id === order.id ||
        session.client_reference_id === order.id;
      if (belongs && session.payment_status === "paid") {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        order = markOrderPaid(order.id, paymentIntentId) ?? order;
      }
    } catch {
      // Leave the order pending and show the pending state below.
    }
  }

  const paid = order.status !== "pending" && order.status !== "cancelled";

  return (
    <main className="mx-auto max-w-site px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-lg">
        <div className="flex justify-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              paid ? "bg-harbor-teal" : "bg-harbor-coral"
            }`}
          >
            <svg aria-hidden width="32" height="32" viewBox="0 0 24 24" fill="none">
              {paid ? (
                <path
                  d="M5 13l4 4L19 7"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M12 8v5M12 16h.01"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </div>
        </div>

        <h1 className="mt-6 text-center font-serif text-3xl sm:text-4xl">
          {paid ? "Order confirmed." : "Payment not completed."}
        </h1>
        <p className="mt-2 text-center text-harbor-ink-soft">
          {paid
            ? order.fulfillment === "delivery"
              ? "We are getting it ready for delivery."
              : "We are getting it ready for pickup."
            : "We could not confirm payment for this order. You were not charged."}
        </p>

        {paid && (
          <div className="mt-8">
            <OrderTracker
              orderId={order.id}
              initialStatus={order.status}
              fulfillment={order.fulfillment}
            />
            <p className="mt-3 text-center text-xs text-harbor-ink-soft">
              Bookmark this page to follow your order, or keep your code{" "}
              <span className="font-mono font-medium text-harbor-teal">
                {order.id}
              </span>
              .
            </p>
          </div>
        )}

        <div className="mt-8 rounded-2xl bg-harbor-cream-deep p-6 shadow-warm">
          <div className="mb-5 text-center">
            <span className="rounded-full bg-harbor-teal/10 px-4 py-1.5 font-mono text-sm font-semibold tracking-wider text-harbor-teal">
              {order.id}
            </span>
            <p className="mt-1.5 text-xs text-harbor-ink-soft">
              Order code -- {ORDER_STATUS_LABELS[order.status]}
            </p>
          </div>

          <ul className="divide-y divide-harbor-line">
            {order.items.map((line, i) => {
              const detail = lineDescription(line);
              return (
                <li key={i} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {line.quantity} x {line.name}
                    </p>
                    {detail && (
                      <p className="mt-0.5 text-xs text-harbor-ink-soft">{detail}</p>
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {formatPrice(line.unitPriceCents * line.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 space-y-1.5 border-t border-harbor-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-harbor-ink-soft">Subtotal</dt>
              <dd>{formatPrice(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-harbor-ink-soft">Tip</dt>
              <dd>{formatPrice(order.tipCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-harbor-line pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="text-harbor-teal">{formatPrice(order.totalCents)}</dd>
            </div>
          </dl>

          <div className="mt-5 border-t border-harbor-line pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-harbor-ink-soft">Fulfillment</span>
              <span className="font-medium capitalize">{order.fulfillment}</span>
            </div>
            {order.fulfillment === "delivery" && order.deliveryAddress && (
              <div className="mt-1 flex justify-between gap-4">
                <span className="text-harbor-ink-soft">Address</span>
                <span className="text-right font-medium">
                  {order.deliveryAddress}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          {paid ? (
            <Link
              href="/menu"
              className="inline-block rounded-full bg-harbor-coral px-8 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
            >
              Back to the menu
            </Link>
          ) : (
            <Link
              href="/order"
              className="inline-block rounded-full bg-harbor-coral px-8 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
            >
              Return to checkout
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
