"use client";

import { useMemo, useState } from "react";
import {
  MAX_LINE_QUANTITY as MAX_QUANTITY,
  useCart,
} from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/menu-format";
import type { CustomizationGroup, MenuItem } from "@/lib/types";

type Selections = Record<string, string | string[]>;

function initialSelections(groups: CustomizationGroup[]): Selections {
  const init: Selections = {};
  for (const group of groups) {
    init[group.id] = group.type === "single" ? group.choices[0].id : [];
  }
  return init;
}

function upcharge(choice: { priceCents?: number }): number {
  return choice.priceCents ?? 0;
}

/**
 * Drawer labels for the chosen options. Skips the zero-information default
 * on optional single groups (first choice, no upcharge, e.g. "No thanks")
 * but always names required choices like steak temperature.
 */
function selectionLabels(
  groups: CustomizationGroup[],
  selections: Selections,
): string[] {
  const labels: string[] = [];
  for (const group of groups) {
    const selected = selections[group.id];
    if (group.type === "single") {
      const index = group.choices.findIndex((c) => c.id === selected);
      if (index === -1) continue;
      const choice = group.choices[index];
      if (group.required || index > 0 || upcharge(choice) > 0) {
        labels.push(choice.label);
      }
    } else {
      for (const choice of group.choices) {
        if ((selected as string[]).includes(choice.id)) {
          labels.push(choice.label);
        }
      }
    }
  }
  return labels;
}

export function ItemCustomizer({ item }: { item: MenuItem }) {
  const groups = item.customizationOptions;
  const { addLine, openCart } = useCart();
  const [selections, setSelections] = useState<Selections>(() =>
    initialSelections(groups),
  );
  const [quantity, setQuantity] = useState(1);

  function pickSingle(groupId: string, choiceId: string) {
    setSelections((prev) => ({ ...prev, [groupId]: choiceId }));
  }

  function toggleMulti(groupId: string, choiceId: string) {
    setSelections((prev) => {
      const current = prev[groupId] as string[];
      const next = current.includes(choiceId)
        ? current.filter((id) => id !== choiceId)
        : [...current, choiceId];
      return { ...prev, [groupId]: next };
    });
  }

  const unitPriceCents = useMemo(() => {
    let cents = item.priceCents;
    for (const group of groups) {
      const selected = selections[group.id];
      if (group.type === "single") {
        const choice = group.choices.find((c) => c.id === selected);
        if (choice) cents += upcharge(choice);
      } else {
        for (const choice of group.choices) {
          if ((selected as string[]).includes(choice.id)) {
            cents += upcharge(choice);
          }
        }
      }
    }
    return cents;
  }, [item.priceCents, groups, selections]);

  const totalCents = unitPriceCents * quantity;

  function handleAdd() {
    addLine({
      slug: item.slug,
      name: item.name,
      quantity,
      unitPriceCents,
      selections,
      selectionLabels: selectionLabels(groups, selections),
    });
    setQuantity(1);
    openCart();
  }

  return (
    <div className="mt-8">
      {groups.map((group) => (
        <fieldset key={group.id} className="mb-6">
          <legend className="font-serif text-lg text-harbor-teal">
            {group.label}
            {group.required && (
              <span className="ml-2 align-middle text-xs font-sans text-harbor-ink-soft">
                required
              </span>
            )}
          </legend>
          <div className="mt-3 space-y-2">
            {group.choices.map((choice) => {
              const selected =
                group.type === "single"
                  ? selections[group.id] === choice.id
                  : (selections[group.id] as string[]).includes(choice.id);
              return (
                <label
                  key={choice.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                    selected
                      ? "border-harbor-teal bg-harbor-teal/5"
                      : "border-harbor-line hover:border-harbor-teal/50"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type={group.type === "single" ? "radio" : "checkbox"}
                      name={`${item.slug}-${group.id}`}
                      value={choice.id}
                      checked={selected}
                      onChange={() =>
                        group.type === "single"
                          ? pickSingle(group.id, choice.id)
                          : toggleMulti(group.id, choice.id)
                      }
                      className="h-4 w-4 accent-harbor-teal"
                    />
                    {choice.label}
                  </span>
                  {upcharge(choice) > 0 && (
                    <span className="text-harbor-ink-soft">
                      + {formatPrice(upcharge(choice))}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-4">
        <div
          className="flex items-center rounded-full border border-harbor-line"
          role="group"
          aria-label="Quantity"
        >
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-4 py-2 text-lg text-harbor-teal disabled:opacity-30"
          >
            &minus;
          </button>
          <span aria-live="polite" className="w-8 text-center font-medium">
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={quantity >= MAX_QUANTITY}
            onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
            className="px-4 py-2 text-lg text-harbor-teal disabled:opacity-30"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex-1 rounded-full bg-harbor-coral px-6 py-3 font-medium text-white shadow-warm-lg transition-colors hover:bg-harbor-coral-deep"
        >
          Add to Cart &middot; {formatPrice(totalCents)}
        </button>
      </div>
    </div>
  );
}
