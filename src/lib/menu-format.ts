/** Client-safe formatting helpers (no database imports). */
export function formatPrice(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}
