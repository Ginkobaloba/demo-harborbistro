"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

export const MAX_LINE_QUANTITY = 12;

const STORAGE_KEY = "hb-cart-v1";

export type CartLine = {
  /** Stable identity: slug + canonical selections. Same dish, same choices -> one line. */
  key: string;
  slug: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  selections: Record<string, string | string[]>;
  /** Human-readable choice labels for the drawer. */
  selectionLabels: string[];
};

/** Canonical key so selection order never splits identical configurations. */
export function lineKey(
  slug: string,
  selections: Record<string, string | string[]>,
): string {
  const canonical = Object.keys(selections)
    .sort()
    .map((groupId) => {
      const value = selections[groupId];
      const chosen = Array.isArray(value) ? [...value].sort().join("+") : value;
      return `${groupId}=${chosen}`;
    })
    .join("&");
  return `${slug}?${canonical}`;
}

type CartState = {
  lines: CartLine[];
  isOpen: boolean;
};

type CartAction =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; line: CartLine }
  | { type: "remove"; key: string }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "clear" }
  | { type: "setOpen"; open: boolean };

function clampQuantity(quantity: number): number {
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.round(quantity)));
}

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return { ...state, lines: action.lines };
    case "add": {
      const existing = state.lines.find((l) => l.key === action.line.key);
      const lines = existing
        ? state.lines.map((l) =>
            l.key === action.line.key
              ? {
                  ...l,
                  quantity: clampQuantity(l.quantity + action.line.quantity),
                }
              : l,
          )
        : [...state.lines, action.line];
      return { ...state, lines };
    }
    case "remove":
      return {
        ...state,
        lines: state.lines.filter((l) => l.key !== action.key),
      };
    case "setQuantity":
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.key === action.key
            ? { ...l, quantity: clampQuantity(action.quantity) }
            : l,
        ),
      };
    case "clear":
      return { ...state, lines: [] };
    case "setOpen":
      return { ...state, isOpen: action.open };
  }
}

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addLine: (line: Omit<CartLine, "key">) => void;
  removeLine: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStoredLines(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) =>
        typeof l?.key === "string" &&
        typeof l?.slug === "string" &&
        typeof l?.name === "string" &&
        typeof l?.unitPriceCents === "number" &&
        typeof l?.quantity === "number",
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { lines: [], isOpen: false });

  // Hydrate from sessionStorage after mount; server and first client render
  // both see an empty cart, so there is no hydration mismatch.
  useEffect(() => {
    const lines = readStoredLines();
    if (lines.length > 0) dispatch({ type: "hydrate", lines });
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
    } catch {
      // Storage full or unavailable; the in-memory cart still works.
    }
  }, [state.lines]);

  const addLine = useCallback((line: Omit<CartLine, "key">) => {
    dispatch({
      type: "add",
      line: { ...line, key: lineKey(line.slug, line.selections) },
    });
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      count: state.lines.reduce((n, l) => n + l.quantity, 0),
      subtotalCents: state.lines.reduce(
        (sum, l) => sum + l.unitPriceCents * l.quantity,
        0,
      ),
      isOpen: state.isOpen,
      openCart: () => dispatch({ type: "setOpen", open: true }),
      closeCart: () => dispatch({ type: "setOpen", open: false }),
      addLine,
      removeLine: (key) => dispatch({ type: "remove", key }),
      setQuantity: (key, quantity) =>
        dispatch({ type: "setQuantity", key, quantity }),
      clearCart: () => dispatch({ type: "clear" }),
    }),
    [state, addLine],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
