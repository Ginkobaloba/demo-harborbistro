"use client";

import { useEffect, useState } from "react";
import type { Fulfillment, OrderStatus } from "@/lib/types";

type StatusResponse = {
  status: OrderStatus;
  statusLabel: string;
};

const STEPS: { key: OrderStatus; label: string; blurb: string }[] = [
  { key: "received", label: "Received", blurb: "We have your order." },
  { key: "preparing", label: "Preparing", blurb: "The kitchen is on it." },
  { key: "ready", label: "Ready", blurb: "Ready for you." },
  { key: "completed", label: "Completed", blurb: "All done. Enjoy." },
];

const STEP_INDEX: Record<string, number> = {
  received: 0,
  preparing: 1,
  ready: 2,
  completed: 3,
};

/**
 * Live order-status tracker. Seeds from the server-rendered status, then polls
 * /api/orders/[id] every few seconds until the order is terminal. Shows the
 * Received -> Preparing -> Ready -> Completed progression as a stepper so a
 * guest watching the page sees it move without reloading.
 */
export function OrderTracker({
  orderId,
  initialStatus,
  fulfillment,
}: {
  orderId: string;
  initialStatus: OrderStatus;
  fulfillment: Fulfillment;
}) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);

  useEffect(() => {
    if (status === "completed" || status === "cancelled") return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (alive) setStatus(data.status);
      } catch {
        // Transient; the next tick retries.
      }
    };
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [orderId, status]);

  if (status === "cancelled") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        This order was cancelled. If that is a surprise, give us a call.
      </div>
    );
  }

  const current = STEP_INDEX[status] ?? 0;
  // "Ready" reads differently for delivery.
  const steps = STEPS.map((s) =>
    s.key === "ready" && fulfillment === "delivery"
      ? { ...s, label: "Out for delivery", blurb: "On its way." }
      : s,
  );

  return (
    <div aria-label="Order status" className="rounded-2xl bg-white p-5 shadow-warm">
      <ol className="flex items-start">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.key} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span
                  className={`h-1 flex-1 rounded ${i === 0 ? "opacity-0" : done || active ? "bg-harbor-teal" : "bg-harbor-line"}`}
                />
                <span
                  className={`mx-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    done
                      ? "bg-harbor-teal text-white"
                      : active
                        ? "bg-harbor-coral text-white ring-4 ring-harbor-coral/20"
                        : "bg-harbor-cream-deep text-harbor-ink-soft"
                  }`}
                >
                  {done ? (
                    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={`h-1 flex-1 rounded ${i === steps.length - 1 ? "opacity-0" : done ? "bg-harbor-teal" : "bg-harbor-line"}`}
                />
              </div>
              <span
                className={`mt-2 text-xs font-medium ${active ? "text-harbor-coral-deep" : done ? "text-harbor-teal" : "text-harbor-ink-soft"}`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="mt-4 text-center text-sm text-harbor-ink-soft">
        {steps[current]?.blurb}
        {status !== "completed" && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs text-harbor-teal">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-harbor-teal opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-harbor-teal" />
            </span>
            live
          </span>
        )}
      </p>
    </div>
  );
}
