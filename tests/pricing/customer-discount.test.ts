import { describe, it, expect } from 'vitest';
import { round2, round4 } from '../../src/lib/pricing';

// Mirrors the customer-specific (negotiated) discount logic added to the
// calculate-pricing edge function for SPEC-020. Tests are pure math — no DB calls.

// ----------------------------------------------------------------------------
// Per-item discount (SPEC-020 D6): slots in as the LAST step of the existing
// multiplicative chain, right before total_discount_pct/usage_total/monthly_total
// are finalized.
// ----------------------------------------------------------------------------

type DiscountType = 'percent' | 'fixed' | null;

interface MirrorItem {
  customer_discount_type?: DiscountType;
  customer_discount_value?: number | null;
}

function applyCustomerItemDiscount(unitPrice: number, item: MirrorItem): number {
  if (item.customer_discount_value == null) return unitPrice;
  if (item.customer_discount_type === 'percent') {
    return round4(unitPrice * (1 - item.customer_discount_value / 100));
  }
  if (item.customer_discount_type === 'fixed') {
    return round4(Math.max(0, unitPrice - item.customer_discount_value));
  }
  return unitPrice;
}

/** Mirrors how total_discount_pct is recomputed after the discount is applied. */
function totalDiscountPct(unitPrice: number, listPrice: number): number {
  if (listPrice <= 0) return 0;
  return round2((1 - unitPrice / listPrice) * 100);
}

// ----------------------------------------------------------------------------
// Quote-level discount (SPEC-020 D4): additive alongside the payment-cadence
// discount, both computed off the same pre-discount contractTotal, then summed
// and subtracted. Never compounded.
// ----------------------------------------------------------------------------

function computeCustomerDiscountAmount(
  contractTotal: number,
  discountType: DiscountType,
  discountValue: number | null | undefined
): number {
  if (discountType === 'percent' && discountValue != null) {
    return round2(contractTotal * discountValue / 100);
  }
  if (discountType === 'fixed' && discountValue != null) {
    return round2(Math.min(discountValue, contractTotal)); // never discount below 0
  }
  return 0;
}

function computeStackedDiscounts(
  contractTotal: number,
  paymentDiscountPct: number,
  customerDiscountType: DiscountType,
  customerDiscountValue: number | null | undefined
): { paymentDiscountAmount: number; customerDiscountAmount: number; contractTotalDiscounted: number } {
  const paymentDiscountAmount = round2(contractTotal * paymentDiscountPct / 100);
  const customerDiscountAmount = computeCustomerDiscountAmount(
    contractTotal,
    customerDiscountType,
    customerDiscountValue
  );
  return {
    paymentDiscountAmount,
    customerDiscountAmount,
    contractTotalDiscounted: round2(contractTotal - paymentDiscountAmount - customerDiscountAmount),
  };
}

// ============================================================================
// PER-ITEM DISCOUNT
// ============================================================================

describe('Per-item customer discount — applyCustomerItemDiscount', () => {
  it('is a no-op when customer_discount_value is null (overwhelmingly common case)', () => {
    expect(applyCustomerItemDiscount(100, { customer_discount_type: null, customer_discount_value: null })).toBe(100);
    expect(applyCustomerItemDiscount(100, {})).toBe(100);
  });

  it('is a no-op when customer_discount_value is undefined', () => {
    expect(applyCustomerItemDiscount(250.5, { customer_discount_type: 'percent' })).toBe(250.5);
  });

  it('reduces unit price by a percentage', () => {
    // 10% off 200 -> 180
    expect(applyCustomerItemDiscount(200, { customer_discount_type: 'percent', customer_discount_value: 10 })).toBe(180);
  });

  it('reduces unit price by a percentage with fractional rounding to 4dp', () => {
    // 7.5% off 33.3333 -> 33.3333 * 0.925 = 30.833305...
    const result = applyCustomerItemDiscount(33.3333, { customer_discount_type: 'percent', customer_discount_value: 7.5 });
    expect(result).toBe(round4(33.3333 * 0.925));
  });

  it('subtracts a fixed amount per unit', () => {
    expect(applyCustomerItemDiscount(100, { customer_discount_type: 'fixed', customer_discount_value: 15 })).toBe(85);
  });

  it('floors a fixed discount at 0 when it exceeds the price', () => {
    expect(applyCustomerItemDiscount(10, { customer_discount_type: 'fixed', customer_discount_value: 25 })).toBe(0);
  });

  it('floors a fixed discount at exactly 0 (edge case: discount equals price)', () => {
    expect(applyCustomerItemDiscount(50, { customer_discount_type: 'fixed', customer_discount_value: 50 })).toBe(0);
  });

  it('treats an unrecognized discount type as a no-op', () => {
    // Defensive: only 'percent' | 'fixed' are meaningful; anything else passes through unchanged
    expect(applyCustomerItemDiscount(100, { customer_discount_type: undefined, customer_discount_value: 10 })).toBe(100);
  });

  it('percent discount of 0 is a true no-op (not skipped, but produces unchanged price)', () => {
    expect(applyCustomerItemDiscount(100, { customer_discount_type: 'percent', customer_discount_value: 0 })).toBe(100);
  });
});

describe('Per-item customer discount — total_discount_pct reflects the new layer', () => {
  it('percent case: total_discount_pct organically includes the customer discount, no manual rollup', () => {
    // List price 100, systematic chain already brought unit_price to 80 (20% systematic discount),
    // then a further 10% customer discount -> unit_price = 72
    const afterSystematic = 80;
    const listPrice = 100;
    const discounted = applyCustomerItemDiscount(afterSystematic, { customer_discount_type: 'percent', customer_discount_value: 10 });
    expect(discounted).toBe(72);
    expect(totalDiscountPct(discounted, listPrice)).toBe(28); // 1 - 72/100 = 28%
  });

  it('fixed case: total_discount_pct reflects the absolute reduction against list price', () => {
    const afterSystematic = 90;
    const listPrice = 100;
    const discounted = applyCustomerItemDiscount(afterSystematic, { customer_discount_type: 'fixed', customer_discount_value: 20 });
    expect(discounted).toBe(70);
    expect(totalDiscountPct(discounted, listPrice)).toBe(30); // 1 - 70/100 = 30%
  });

  it('null case: total_discount_pct is unaffected (identical to pre-SPEC-020 behavior)', () => {
    const afterSystematic = 80;
    const listPrice = 100;
    const discounted = applyCustomerItemDiscount(afterSystematic, { customer_discount_type: null, customer_discount_value: null });
    expect(discounted).toBe(afterSystematic);
    expect(totalDiscountPct(discounted, listPrice)).toBe(20);
  });

  it('fixed discount that floors at 0 caps total_discount_pct at 100%', () => {
    const afterSystematic = 15;
    const listPrice = 100;
    const discounted = applyCustomerItemDiscount(afterSystematic, { customer_discount_type: 'fixed', customer_discount_value: 50 });
    expect(discounted).toBe(0);
    expect(totalDiscountPct(discounted, listPrice)).toBe(100);
  });
});

// ============================================================================
// QUOTE-LEVEL DISCOUNT (additive stacking with payment cadence)
// ============================================================================

describe('Quote-level customer discount — computeCustomerDiscountAmount', () => {
  it('percent: computes discount off contractTotal', () => {
    expect(computeCustomerDiscountAmount(100_000, 'percent', 5)).toBe(5_000);
  });

  it('fixed: subtracts the flat amount', () => {
    expect(computeCustomerDiscountAmount(100_000, 'fixed', 10_000)).toBe(10_000);
  });

  it('fixed: floors at contractTotal when the discount exceeds it (never negative)', () => {
    expect(computeCustomerDiscountAmount(5_000, 'fixed', 10_000)).toBe(5_000);
  });

  it('null/undefined value is a true no-op regardless of type', () => {
    expect(computeCustomerDiscountAmount(100_000, 'percent', null)).toBe(0);
    expect(computeCustomerDiscountAmount(100_000, 'fixed', undefined)).toBe(0);
    expect(computeCustomerDiscountAmount(100_000, null, null)).toBe(0);
  });
});

describe('Quote-level customer discount — additive stacking alongside payment cadence', () => {
  it('applies both discounts, summed, without compounding (percent + percent)', () => {
    // Contract total 360,000; payment cadence 23%; customer 5% — both computed
    // independently off the SAME contractTotal, not chained.
    const { paymentDiscountAmount, customerDiscountAmount, contractTotalDiscounted } =
      computeStackedDiscounts(360_000, 23, 'percent', 5);

    expect(paymentDiscountAmount).toBe(82_800); // 23% of 360,000
    expect(customerDiscountAmount).toBe(18_000); // 5% of 360,000 (NOT 5% of the already-discounted total)
    expect(contractTotalDiscounted).toBe(360_000 - 82_800 - 18_000);
    expect(contractTotalDiscounted).toBe(259_200);
  });

  it('applies both discounts, summed, without compounding (percent + fixed)', () => {
    const { paymentDiscountAmount, customerDiscountAmount, contractTotalDiscounted } =
      computeStackedDiscounts(100_000, 10, 'fixed', 7_500);

    expect(paymentDiscountAmount).toBe(10_000);
    expect(customerDiscountAmount).toBe(7_500);
    expect(contractTotalDiscounted).toBe(82_500);
  });

  it('verifies non-compounding: sum-then-subtract differs from sequential compounding', () => {
    const contractTotal = 200_000;
    const { paymentDiscountAmount, customerDiscountAmount, contractTotalDiscounted } =
      computeStackedDiscounts(contractTotal, 20, 'percent', 10);

    // Additive (correct, per D4): 200,000 - 40,000 - 20,000 = 140,000
    expect(contractTotalDiscounted).toBe(140_000);

    // Compounding (wrong, must NOT match): 200,000 * 0.8 * 0.9 = 144,000
    const compoundedWrong = round2(contractTotal * (1 - 0.20) * (1 - 0.10));
    expect(contractTotalDiscounted).not.toBe(compoundedWrong);
  });

  it('customer discount alone (no payment cadence discount, 0%)', () => {
    const { paymentDiscountAmount, customerDiscountAmount, contractTotalDiscounted } =
      computeStackedDiscounts(50_000, 0, 'fixed', 5_000);

    expect(paymentDiscountAmount).toBe(0);
    expect(customerDiscountAmount).toBe(5_000);
    expect(contractTotalDiscounted).toBe(45_000);
  });

  it('payment cadence discount alone (no customer discount set — true no-op)', () => {
    const { paymentDiscountAmount, customerDiscountAmount, contractTotalDiscounted } =
      computeStackedDiscounts(50_000, 6, null, null);

    expect(customerDiscountAmount).toBe(0);
    expect(paymentDiscountAmount).toBe(3_000);
    expect(contractTotalDiscounted).toBe(47_000);
  });

  it('neither discount set: existing quotes behave identically to pre-SPEC-020 (zero-effect default)', () => {
    const { paymentDiscountAmount, customerDiscountAmount, contractTotalDiscounted } =
      computeStackedDiscounts(75_000, 0, null, null);

    expect(paymentDiscountAmount).toBe(0);
    expect(customerDiscountAmount).toBe(0);
    expect(contractTotalDiscounted).toBe(75_000);
  });
});
