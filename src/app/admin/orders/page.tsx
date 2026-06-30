import Link from "next/link";
import type { Metadata } from "next";
import { formatPrice } from "@/lib/menu-format";
import {
  ACTIVE_ORDER_STATUSES,
  getActiveOrders,
  getKitchenCounts,
  getRecentOrders,
  lineDescription,
} from "@/lib/orders";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/lib/types";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { OrderActions } from "@/components/admin/OrderActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin: Kitchen Orders",
};

const COLUMN_ACCENT: Record<string, string> = {
  received: "border-t-harbor-coral",
  preparing: "border-t-amber-400",
  ready: "border-t-harbor-teal",
};

const STATUS_CHIP: Record<string, string> = {
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

/** "4 min ago" / "2 hr ago" from an ISO/SQLite UTC timestamp. */
function ago(iso: string): string {
  const then = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

function OrderCard({ order }: { order: Order }) {
  return (
    <li className="rounded-xl border border-harbor-line bg-white p-4 shadow-warm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-harbor-teal">
          {order.id}
        </span>
        <span className="text-xs text-harbor-ink-soft">
          {ago(order.createdAt)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{order.customerName}</span>
        <span className="rounded-full bg-harbor-cream-deep px-2 py-0.5 text-xs capitalize text-harbor-ink-soft">
          {order.fulfillment}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-harbor-line pt-3 text-sm">
        {order.items.map((line, i) => {
          const detail = lineDescription(line);
          return (
            <li key={i}>
              <span className="font-medium">
                {line.quantity}x {line.name}
              </span>
              {detail && (
                <span className="block text-xs text-harbor-ink-soft">
                  {detail}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-harbor-line pt-3">
        <span className="text-sm font-semibold text-harbor-teal">
          {formatPrice(order.totalCents)}
        </span>
        <OrderActions id={order.id} status={order.status} />
      </div>
    </li>
  );
}

export default function AdminOrdersPage() {
  const active = getActiveOrders();
  const recent = getRecentOrders(20);
  const counts = getKitchenCounts();

  const byStatus = new Map<OrderStatus, Order[]>();
  for (const s of ACTIVE_ORDER_STATUSES) byStatus.set(s, []);
  for (const o of active) byStatus.get(o.status as OrderStatus)!.push(o);

  return (
    <main className="mx-auto max-w-site px-4 py-10 sm:px-6">
      <AutoRefresh intervalMs={10000} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl">Kitchen</h1>
          <p className="mt-1 text-sm text-harbor-ink-soft">
            Live order queue. Updates on its own every few seconds.
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/reservations" className="text-harbor-teal hover:text-harbor-coral">
            Reservations
          </Link>
          <Link href="/admin" className="text-harbor-teal hover:text-harbor-coral">
            Admin home
          </Link>
        </nav>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {ACTIVE_ORDER_STATUSES.map((status) => {
          const list = byStatus.get(status)!;
          return (
            <section
              key={status}
              aria-label={ORDER_STATUS_LABELS[status]}
              className={`rounded-2xl border border-harbor-line border-t-4 bg-harbor-cream-deep/40 p-3 ${COLUMN_ACCENT[status]}`}
            >
              <h2 className="flex items-center justify-between px-1 font-serif text-lg">
                {ORDER_STATUS_LABELS[status]}
                <span className="rounded-full bg-white px-2 py-0.5 text-sm text-harbor-ink-soft">
                  {counts[status]}
                </span>
              </h2>
              {list.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-harbor-ink-soft">
                  Nothing here right now.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {list.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <h2 className="mt-12 font-serif text-2xl">Recently closed</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-harbor-line bg-white shadow-warm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-harbor-line bg-harbor-cream-deep text-left text-xs font-medium uppercase tracking-wide text-harbor-ink-soft">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-harbor-line">
            {recent.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-harbor-ink-soft">
                  No closed orders yet.
                </td>
              </tr>
            ) : (
              recent.map((o) => (
                <tr key={o.id} className="hover:bg-harbor-cream/40">
                  <td className="px-4 py-3 font-mono font-medium text-harbor-teal">
                    {o.id}
                  </td>
                  <td className="px-4 py-3">{o.customerName}</td>
                  <td className="px-4 py-3">{formatPrice(o.totalCents)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_CHIP[o.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-harbor-ink-soft">
                    {ago(o.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
