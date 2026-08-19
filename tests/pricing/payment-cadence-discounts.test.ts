import { describe, it, expect } from 'vitest';
import { round2 } from '../../src/lib/pricing';

// Mirrors the cadence discount logic in the calculate-pricing edge function.
// Tests are pure math — no DB calls.

const SEED_CADENCE_FACTORS = new Map<number, number>([
  [1,  0],
  [3,  2],
  [6,  4],
  [12, 6],
  [24, 15],
  [36, 23],
  [48, 25],
  [60, 30],
]);

function getEffectiveDiscountPct(
  cadenceFactors: Map<number, number>,
  upfrontMonths: number,
  override: number | null
): number {
  if (override != null) return override;
  return cadenceFactors.get(upfrontMonths) ?? 0;
}

function computeContractDiscount(
  monthlyTotal: number,
  maxTermMonths: number,
  discountPct: number
): { contractTotal: number; discountAmount: number; discountedTotal: number } {
  const contractTotal = round2(monthlyTotal * maxTermMonths);
  const discountAmount = round2(contractTotal * discountPct / 100);
  return { contractTotal, discountAmount, discountedTotal: round2(contractTotal - discountAmount) };
}

describe('Payment Cadence — discount lookup', () => {
  it('returns 0% for 1-month (monthly baseline)', () => {
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 1, null)).toBe(0);
  });

  it('returns seeded discount for each configured term', () => {
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 3,  null)).toBe(2);
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 6,  null)).toBe(4);
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 12, null)).toBe(6);
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 24, null)).toBe(15);
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 36, null)).toBe(23);
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 48, null)).toBe(25);
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 60, null)).toBe(30);
  });

  it('returns 0% for an unknown upfront_months (no match)', () => {
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 18, null)).toBe(0);
  });

  it('override takes precedence over table value', () => {
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 36, 20)).toBe(20);
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 12, 0)).toBe(0);
  });

  it('override of 0 is respected (not treated as null)', () => {
    expect(getEffectiveDiscountPct(SEED_CADENCE_FACTORS, 60, 0)).toBe(0);
  });
});

describe('Payment Cadence — contract total and discount amount', () => {
  it('computes correct contract total for a 36-month quote', () => {
    const { contractTotal } = computeContractDiscount(10_000, 36, 0);
    expect(contractTotal).toBe(360_000);
  });

  it('applies 23% discount to 36-month quote', () => {
    // Monthly total: 10,000; 36-month contract = 360,000; 23% discount = 82,800
    const { contractTotal, discountAmount, discountedTotal } =
      computeContractDiscount(10_000, 36, 23);
    expect(contractTotal).toBe(360_000);
    expect(discountAmount).toBe(82_800);
    expect(discountedTotal).toBe(277_200);
  });

  it('0% discount produces no change (monthly baseline)', () => {
    const { contractTotal, discountAmount, discountedTotal } =
      computeContractDiscount(5_000, 12, 0);
    expect(contractTotal).toBe(60_000);
    expect(discountAmount).toBe(0);
    expect(discountedTotal).toBe(60_000);
  });

  it('30% discount for 60-month upfront on a 60-month quote', () => {
    const monthly = 8_000;
    const { contractTotal, discountAmount, discountedTotal } =
      computeContractDiscount(monthly, 60, 30);
    expect(contractTotal).toBe(480_000);
    expect(discountAmount).toBe(144_000);
    expect(discountedTotal).toBe(336_000);
  });

  it('discount amount rounds to 2 decimal places', () => {
    // 1,000/month × 36 months = 36,000; 23% = 8,280.00 (clean)
    const { discountAmount } = computeContractDiscount(1_000, 36, 23);
    const decimals = (discountAmount.toString().split('.')[1] || '').length;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it('discounted total equals contract total minus discount amount', () => {
    const result = computeContractDiscount(7_500, 24, 15);
    expect(result.discountedTotal).toBe(round2(result.contractTotal - result.discountAmount));
  });
});
