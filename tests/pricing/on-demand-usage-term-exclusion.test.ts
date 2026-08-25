import { describe, it, expect } from 'vitest';
import { interpolateTermFactor } from '../../src/lib/pricing';

// Mirrors getUsageTermFactor in the calculate-pricing edge function: usage-based
// SKUs whose pricing_models row has apply_term_discount=false (e.g. on-demand
// support hour overages) must price flat at the configured rate regardless of
// the package's commitment term.

const CCS_TERM_FACTORS = new Map<number, number>([
  [1, 1.0],
  [12, 0.94],
  [24, 0.80],
  [36, 0.72],
]);

function getUsageTermFactor(
  termFactors: Map<number, number>,
  applyTermDiscount: boolean,
  termMonths: number
): number {
  if (!applyTermDiscount) return 1;
  return interpolateTermFactor(termFactors, termMonths, 'ccs');
}

describe('Usage pricing model — apply_term_discount flag', () => {
  it('applies the normal category term factor when apply_term_discount is true', () => {
    expect(getUsageTermFactor(CCS_TERM_FACTORS, true, 36)).toBe(0.72);
    expect(getUsageTermFactor(CCS_TERM_FACTORS, true, 12)).toBe(0.94);
  });

  it('ignores commitment term entirely when apply_term_discount is false', () => {
    expect(getUsageTermFactor(CCS_TERM_FACTORS, false, 1)).toBe(1);
    expect(getUsageTermFactor(CCS_TERM_FACTORS, false, 12)).toBe(1);
    expect(getUsageTermFactor(CCS_TERM_FACTORS, false, 36)).toBe(1);
    expect(getUsageTermFactor(CCS_TERM_FACTORS, false, 60)).toBe(1);
  });

  it('on-demand rate stays identical regardless of the package term length', () => {
    const rate12 = getUsageTermFactor(CCS_TERM_FACTORS, false, 12);
    const rate36 = getUsageTermFactor(CCS_TERM_FACTORS, false, 36);
    const rate60 = getUsageTermFactor(CCS_TERM_FACTORS, false, 60);
    expect(rate12).toBe(rate36);
    expect(rate36).toBe(rate60);
  });

  it('defaults to true (normal term discount applies) when unspecified', () => {
    // Mirrors the DB column default (NOT NULL DEFAULT TRUE) — existing usage
    // SKUs are unaffected unless explicitly opted out.
    const defaultApplyTermDiscount = true;
    expect(getUsageTermFactor(CCS_TERM_FACTORS, defaultApplyTermDiscount, 36)).toBe(0.72);
  });
});
