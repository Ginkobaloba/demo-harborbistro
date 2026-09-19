import { describe, it, expect } from "vitest";
import { MAX_TIP_CENTS, TIP_PRESETS, maxTipCents, parseTipCents, presetTipCents } from "./tip";

describe("tip limit", () => {
  it("is $1,000 for small orders and 100% of the subtotal above that", () => {
    expect(maxTipCents(0)).toBe(MAX_TIP_CENTS);
    expect(maxTipCents(3600)).toBe(MAX_TIP_CENTS);
    expect(maxTipCents(MAX_TIP_CENTS)).toBe(MAX_TIP_CENTS);
    expect(maxTipCents(612_000)).toBe(612_000);
  });

  it("accepts the boundary and refuses one cent over", () => {
    expect(parseTipCents(612_000, 612_000)).toEqual({ ok: true, value: 612_000 });
    expect(parseTipCents(612_001, 612_000).ok).toBe(false);
    expect(parseTipCents(MAX_TIP_CENTS, 3600).ok).toBe(true);
    expect(parseTipCents(MAX_TIP_CENTS + 1, 3600).ok).toBe(false);
  });

  it("stays integer-only and non-negative", () => {
    for (const bad of [true, "7", [5], 1.5, -1, Number.NaN, Infinity]) {
      expect(parseTipCents(bad, 1_000_000).ok).toBe(false);
    }
    expect(parseTipCents(undefined, 5000)).toEqual({ ok: true, value: 0 });
    expect(parseTipCents(-0, 5000)).toEqual({ ok: true, value: 0 });
  });
});

describe("order form presets (the form logic)", () => {
  it("never produce a tip the server refuses, at any subtotal", () => {
    // Includes the verify repro ($6,120) and the old breaking points
    // (about $5,000 at 20%, about $5,555.56 at 18%).
    for (const subtotal of [0, 1, 999, 3600, 500_000, 555_556, 612_000, 1_080_000, 50_000_000]) {
      for (const pct of TIP_PRESETS) {
        const tip = presetTipCents(subtotal, pct);
        expect(parseTipCents(tip, subtotal)).toEqual({ ok: true, value: tip });
      }
    }
  });

  it("is the plain rounded percentage for real presets", () => {
    expect(presetTipCents(612_000, 0.18)).toBe(110_160);
    expect(presetTipCents(612_000, 0.2)).toBe(122_400);
    expect(presetTipCents(3333, 0.15)).toBe(500);
  });

  it("clamps a percentage above 100% to the limit", () => {
    expect(presetTipCents(612_000, 1.5)).toBe(612_000);
    expect(presetTipCents(1000, 500)).toBe(MAX_TIP_CENTS);
  });
});
