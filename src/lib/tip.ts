/**
 * Tip rules (D-017), shared by the checkout route and the order form. Pure
 * and dependency-free so the client bundle can import it.
 *
 * A tip may be up to 100% of the subtotal, and the limit is never lower
 * than MAX_TIP_CENTS ($1,000), so small orders still allow a generous tip.
 * The form's percentage presets are clamped to the same limit, so a preset
 * can never produce a tip the server refuses.
 */

/** The floor of the tip limit, in cents ($1,000). */
export const MAX_TIP_CENTS = 100_000;

/** Tip presets offered by the order form, as fractions of the subtotal. */
export const TIP_PRESETS = [0, 0.15, 0.18, 0.2] as const;

/** Largest tip accepted for a given subtotal: max($1,000, 100% of subtotal). */
export function maxTipCents(subtotalCents: number): number {
  return Math.max(MAX_TIP_CENTS, Math.max(0, Math.floor(subtotalCents)));
}

/** A preset percentage tip, rounded to cents and clamped to the limit. */
export function presetTipCents(subtotalCents: number, pct: number): number {
  const raw = Math.round(subtotalCents * pct);
  return Math.min(Math.max(0, raw), maxTipCents(subtotalCents));
}

export type TipResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Validate the client's tip against the server-priced subtotal. Absent or
 * null means no tip. Anything else must be a JSON number that is a
 * non-negative integer no larger than maxTipCents(subtotalCents); booleans,
 * strings, arrays and fractions are refused rather than coerced.
 */
export function parseTipCents(raw: unknown, subtotalCents: number): TipResult {
  if (raw === undefined || raw === null) return { ok: true, value: 0 };
  const max = maxTipCents(subtotalCents);
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > max) {
    return {
      ok: false,
      error: `Tip must be a whole number of cents from 0 to ${max}`,
    };
  }
  return { ok: true, value: raw === 0 ? 0 : raw }; // folds -0 to 0
}
