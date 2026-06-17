import type Stripe from "stripe";
import { markOrderCancelled, markOrderPaid } from "./orders";

/**
 * Apply a Stripe event to local order state. Kept in a lib module (not the
 * route file) so it can be imported by tests and so the route file exports
 * only the HTTP handlers Next.js allows. All handlers are idempotent.
 */
export function handleStripeEvent(event: Stripe.Event): { handled: boolean } {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId =
        session.metadata?.order_id ?? session.client_reference_id ?? null;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      if (orderId && session.payment_status === "paid") {
        markOrderPaid(orderId, paymentIntentId);
        return { handled: true };
      }
      return { handled: false };
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId =
        session.metadata?.order_id ?? session.client_reference_id ?? null;
      if (orderId) {
        markOrderCancelled(orderId);
        return { handled: true };
      }
      return { handled: false };
    }
    default:
      return { handled: false };
  }
}
