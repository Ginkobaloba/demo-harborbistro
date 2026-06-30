"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/lib/types";

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  received: "Start preparing",
  preparing: "Mark ready",
  ready: "Complete",
};

/**
 * Operator controls for one paid order. The advance button's label reflects
 * the next kitchen step; cancel voids the order. Both POST to
 * /api/admin/orders/[id] and refresh the server board on success.
 */
export function OrderActions({
  id,
  status,
}: {
  id: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "advance" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Action failed");
        setBusy(false);
        return;
      }
      router.refresh();
      // Leave `busy` true: the row is about to re-render in its new state.
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  const advanceLabel = NEXT_LABEL[status];

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {advanceLabel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("advance")}
            className="rounded-full bg-harbor-teal px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-harbor-teal/90 disabled:opacity-50"
          >
            {advanceLabel}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => act("cancel")}
          className="rounded-full border border-harbor-line px-3 py-1.5 text-xs font-medium text-harbor-ink-soft transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
