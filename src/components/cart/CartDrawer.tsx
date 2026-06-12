"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/menu-format";
import { MAX_LINE_QUANTITY, useCart } from "./CartProvider";

export function CartDrawer() {
  const {
    lines,
    subtotalCents,
    isOpen,
    closeCart,
    removeLine,
    setQuantity,
  } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNotice(null);
      return;
    }
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeCart();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close cart"
        onClick={closeCart}
        className="absolute inset-0 h-full w-full cursor-default bg-harbor-ink/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        tabIndex={-1}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-harbor-cream shadow-warm-lg outline-none"
      >
        <header className="flex items-center justify-between border-b border-harbor-line px-6 py-4">
          <h2 className="font-serif text-2xl text-harbor-teal">Your Cart</h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
            className="rounded-full px-3 py-1 text-2xl leading-none text-harbor-ink-soft hover:text-harbor-teal"
          >
            &times;
          </button>
        </header>

        {lines.length === 0 ? (
          <p className="flex-1 px-6 py-10 text-harbor-ink-soft">
            Your cart is empty. The menu is full of fixes for that.
          </p>
        ) : (
          <ul className="flex-1 divide-y divide-harbor-line overflow-y-auto px-6">
            {lines.map((line) => (
              <li key={line.key} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-lg leading-snug">
                    {line.name}
                  </h3>
                  <span className="whitespace-nowrap text-sm text-harbor-ink-soft">
                    {formatPrice(line.unitPriceCents * line.quantity)}
                  </span>
                </div>
                {line.selectionLabels.length > 0 && (
                  <p className="mt-1 text-xs text-harbor-ink-soft">
                    {line.selectionLabels.join(" / ")}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div
                    className="flex items-center rounded-full border border-harbor-line"
                    role="group"
                    aria-label={`Quantity of ${line.name}`}
                  >
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={line.quantity <= 1}
                      onClick={() => setQuantity(line.key, line.quantity - 1)}
                      className="px-3 py-1 text-harbor-teal disabled:opacity-30"
                    >
                      &minus;
                    </button>
                    <span className="w-7 text-center text-sm font-medium">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={line.quantity >= MAX_LINE_QUANTITY}
                      onClick={() => setQuantity(line.key, line.quantity + 1)}
                      className="px-3 py-1 text-harbor-teal disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="text-xs text-harbor-ink-soft underline hover:text-harbor-coral-deep"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="border-t border-harbor-line px-6 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-harbor-ink-soft">Subtotal</span>
            <span className="font-serif text-xl text-harbor-teal">
              {formatPrice(subtotalCents)}
            </span>
          </div>
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={() =>
              setNotice(
                "Checkout is almost here. Online payment (test mode) goes live in the next update.",
              )
            }
            className="mt-3 w-full rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm-lg transition-colors hover:bg-harbor-coral-deep disabled:opacity-40"
          >
            Checkout
          </button>
          {notice && (
            <p
              role="status"
              className="mt-3 rounded-xl bg-harbor-teal/10 px-4 py-3 text-sm text-harbor-teal"
            >
              {notice}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
