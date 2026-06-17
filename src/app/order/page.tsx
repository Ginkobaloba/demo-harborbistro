"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/menu-format";
import { useCart } from "@/components/cart/CartProvider";

const TIP_PRESETS = [0, 0.15, 0.18, 0.2];

export default function OrderPage() {
  const { lines, subtotalCents, setQuantity, removeLine } = useCart();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [tipPct, setTipPct] = useState(0.18);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("canceled")) setCanceled(true);
  }, []);

  const tipCents = useMemo(
    () => Math.round(subtotalCents * tipPct),
    [subtotalCents, tipPct],
  );
  const totalCents = subtotalCents + tipCents;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            slug: l.slug,
            quantity: l.quantity,
            selections: l.selections,
          })),
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          fulfillment,
          deliveryAddress: address,
          tipCents,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not reach the payment service. Please try again.");
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto max-w-site px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="font-serif text-3xl sm:text-4xl">Your cart is empty</h1>
          <p className="mt-3 text-harbor-ink-soft">
            Add a few things from the menu and they will show up here.
          </p>
          {canceled && (
            <p
              role="status"
              className="mt-6 rounded-xl bg-harbor-teal/10 px-4 py-3 text-sm text-harbor-teal"
            >
              No worries, your checkout was canceled and you were not charged.
            </p>
          )}
          <Link
            href="/menu"
            className="mt-8 inline-block rounded-full bg-harbor-coral px-8 py-3 font-medium text-white shadow-warm transition-colors hover:bg-harbor-coral-deep"
          >
            Browse the menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-site px-4 py-12 sm:px-6">
      <h1 className="font-serif text-3xl sm:text-4xl">Checkout</h1>
      <p className="mt-2 text-harbor-ink-soft">
        Test mode demo. Use card 4242 4242 4242 4242, any future expiry, any CVC.
      </p>

      {canceled && (
        <p
          role="status"
          className="mt-6 rounded-xl bg-harbor-teal/10 px-4 py-3 text-sm text-harbor-teal"
        >
          Your previous checkout was canceled and you were not charged.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* Order review */}
        <section aria-labelledby="review-heading">
          <h2 id="review-heading" className="font-serif text-xl">
            Your order
          </h2>
          <ul className="mt-4 divide-y divide-harbor-line">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start gap-4 py-4">
                <div className="flex-1">
                  <p className="font-medium">{line.name}</p>
                  {line.selectionLabels.length > 0 && (
                    <p className="mt-0.5 text-sm text-harbor-ink-soft">
                      {line.selectionLabels.join(", ")}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <label className="sr-only" htmlFor={`qty-${line.key}`}>
                      Quantity for {line.name}
                    </label>
                    <select
                      id={`qty-${line.key}`}
                      value={line.quantity}
                      onChange={(e) =>
                        setQuantity(line.key, Number(e.target.value))
                      }
                      className="rounded-lg border border-harbor-line bg-white px-2 py-1 text-sm"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-sm text-harbor-ink-soft underline underline-offset-2 hover:text-harbor-coral-deep"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <span className="font-medium">
                  {formatPrice(line.unitPriceCents * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Customer + payment form */}
        <form
          onSubmit={handleSubmit}
          className="h-fit rounded-2xl bg-harbor-cream-deep p-6 shadow-warm"
        >
          <h2 className="font-serif text-xl">Your details</h2>

          <div className="mt-4 space-y-3">
            <Field label="Name" required>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-harbor-line bg-white px-3 py-2"
              />
            </Field>
            <Field label="Phone" required>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-harbor-line bg-white px-3 py-2"
              />
            </Field>
            <Field label="Email (for your receipt)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-harbor-line bg-white px-3 py-2"
              />
            </Field>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Fulfillment</legend>
            <div className="mt-2 flex gap-2">
              {(["pickup", "delivery"] as const).map((opt) => (
                <label
                  key={opt}
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm capitalize ${
                    fulfillment === opt
                      ? "border-harbor-teal bg-harbor-teal/10 font-medium text-harbor-teal"
                      : "border-harbor-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    value={opt}
                    checked={fulfillment === opt}
                    onChange={() => setFulfillment(opt)}
                    className="sr-only"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </fieldset>

          {fulfillment === "delivery" && (
            <Field label="Delivery address" required>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-2 w-full rounded-lg border border-harbor-line bg-white px-3 py-2"
              />
            </Field>
          )}

          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Tip</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {TIP_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setTipPct(pct)}
                  className={`rounded-lg border px-2 py-2 text-sm ${
                    tipPct === pct
                      ? "border-harbor-teal bg-harbor-teal/10 font-medium text-harbor-teal"
                      : "border-harbor-line"
                  }`}
                >
                  {pct === 0 ? "None" : `${Math.round(pct * 100)}%`}
                </button>
              ))}
            </div>
          </fieldset>

          <dl className="mt-6 space-y-1.5 border-t border-harbor-line pt-4 text-sm">
            <Row label="Subtotal" value={formatPrice(subtotalCents)} />
            <Row label="Tip" value={formatPrice(tipCents)} />
            <div className="flex justify-between border-t border-harbor-line pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="text-harbor-teal">{formatPrice(totalCents)}</dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="mt-4 text-sm text-harbor-coral-deep">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm-lg transition-colors hover:bg-harbor-coral-deep disabled:opacity-50"
          >
            {submitting ? "Redirecting to payment..." : `Pay ${formatPrice(totalCents)}`}
          </button>
          <p className="mt-3 text-center text-xs text-harbor-ink-soft">
            Secured by Stripe. You will be redirected to enter your card.
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">
        {label}
        {required && <span className="text-harbor-coral-deep"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-harbor-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
