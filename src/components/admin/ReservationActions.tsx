"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReservationStatus } from "@/lib/types";

const NEXT: Partial<Record<ReservationStatus, { to: ReservationStatus; label: string }>> = {
  confirmed: { to: "seated", label: "Seat" },
  seated: { to: "completed", label: "Complete" },
};

/**
 * Host-stand controls for one reservation. Advances confirmed -> seated ->
 * completed, with cancel available before completion. POSTs to
 * /api/admin/reservations/[id] and refreshes the board.
 */
export function ReservationActions({
  id,
  status,
}: {
  id: string;
  status: ReservationStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(to: ReservationStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reservations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Action failed");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  const next = NEXT[status];
  const terminal = status === "completed" || status === "cancelled";
  if (terminal) {
    return <span className="text-xs text-harbor-ink-soft">--</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        {next && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(next.to)}
            className="rounded-full bg-harbor-teal px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-harbor-teal/90 disabled:opacity-50"
          >
            {next.label}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("cancelled")}
          className="rounded-full border border-harbor-line px-3 py-1.5 text-xs font-medium text-harbor-ink-soft transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
