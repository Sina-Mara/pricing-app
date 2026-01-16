import { describe, it, expect } from 'vitest';
import { interpolateTermFactor, round4 } from '../../src/lib/pricing';

describe('Term Factor Interpolation', () => {
  // Standard term factors: longer terms = lower factors (more discount)
  const termFactors = new Map<number, number>([
    [12, 1.0],    // 1 year: no discount
    [24, 0.9],    // 2 years: 10% discount
    [36, 0.8],    // 3 years: 20% discount
    [48, 0.72],   // 4 years: 28% discount
    [60, 0.65],   // 5 years: 35% discount
  ]);

  it('returns exact factor when term matches', () => {
    expect(interpolateTermFactor(termFactors, 12, 'default')).toBe(1.0);
    expect(interpolateTermFactor(termFactors, 24, 'default')).toBe(0.9);
    expect(interpolateTermFactor(termFactors, 36, 'default')).toBe(0.8);
    expect(interpolateTermFactor(termFactors, 48, 'default')).toBe(0.72);
    expect(interpolateTermFactor(termFactors, 60, 'default')).toBe(0.65);
  });

  it('interpolates between known terms', () => {
    // 18 months: halfway between 12 (1.0) and 24 (0.9)
    const factor18 = interpolateTermFactor(termFactors, 18, 'default');
    expect(factor18).toBe(0.95);

    // 30 months: halfway between 24 (0.9) and 36 (0.8)
    const factor30 = interpolateTermFactor(termFactors, 30, 'default');
    expect(factor30).toBe(0.85);
  });

  it('uses lowest factor for terms below minimum', () => {
    const factor6 = interpolateTermFactor(termFactors, 6, 'default');
    expect(factor6).toBe(1.0); // Should use 12-month factor
  });

  it('extrapolates for terms above maximum', () => {
    // 72 months (6 years): should extrapolate from trend
    const factor72 = interpolateTermFactor(termFactors, 72, 'default');
    // Rate from 48->60: (0.65 - 0.72) / (60 - 48) = -0.00583/month
    // Extrapolated: 0.65 + (-0.00583 * 12) = 0.58
    expect(factor72).toBeLessThan(0.65);
    // But should not go below 50% of last known factor for non-CAS
    expect(factor72).toBeGreaterThanOrEqual(0.65 * 0.5);
  });

  it('returns 1 for empty term factors', () => {
    const emptyFactors = new Map<number, number>();
    expect(interpolateTermFactor(emptyFactors, 24, 'default')).toBe(1);
  });

  it('uses single value when only one term defined', () => {
    const singleFactor = new Map<number, number>([[12, 0.95]]);
    expect(interpolateTermFactor(singleFactor, 6, 'default')).toBe(0.95);
    expect(interpolateTermFactor(singleFactor, 24, 'default')).toBe(0.95);
    expect(interpolateTermFactor(singleFactor, 36, 'default')).toBe(0.95);
  });
});

describe('Term Factor - CAS Category Special Rules', () => {
  const casTermFactors = new Map<number, number>([
    [12, 1.0],
    [24, 0.85],
    [36, 0.72],
    [48, 0.62],
    [60, 0.52],
  ]);

  it('caps CAS extrapolation at 0.52 for 60+ months', () => {
    const factor72 = interpolateTermFactor(casTermFactors, 72, 'cas');
    // CAS has special cap at 0.52 for 60+ months - extrapolated value won't exceed this
    // But if extrapolated value is already below 0.52, it stays at extrapolated value
    expect(factor72).toBeLessThanOrEqual(0.52);

    // Test that the cap actually limits when extrapolation would exceed 0.52
    // Using factors that would extrapolate above 0.52
    const highFactors = new Map<number, number>([
      [12, 1.0],
      [24, 0.95],  // Slower decay that would extrapolate above 0.52
      [36, 0.90],
      [48, 0.85],
      [60, 0.80],
    ]);
    const factorWithCap = interpolateTermFactor(highFactors, 72, 'cas');
    // Without cap, would extrapolate to ~0.75, but cap limits to 0.52
    expect(factorWithCap).toBe(0.52);
  });

  it('applies minimum factor rule for CAS below 60 months', () => {
    // For CAS below 60 months, minimum is 25% of last factor
    const shortTermFactors = new Map<number, number>([
      [12, 1.0],
      [24, 0.9],
    ]);

    const factor36 = interpolateTermFactor(shortTermFactors, 36, 'cas');
    // Should not go below 0.9 * 0.25 = 0.225
    expect(factor36).toBeGreaterThanOrEqual(0.225);
  });

  it('applies standard interpolation for CAS between known terms', () => {
    const factor18 = interpolateTermFactor(casTermFactors, 18, 'cas');
    // 18 months: halfway between 12 (1.0) and 24 (0.85)
    expect(factor18).toBe(0.925);
  });
});

describe('Term Factor - Different Categories', () => {
  const defaultFactors = new Map<number, number>([
    [12, 1.0],
    [24, 0.88],
    [36, 0.78],
  ]);

  const cnoFactors = new Map<number, number>([
    [12, 1.0],
    [24, 0.92],
    [36, 0.85],
  ]);

  it('uses same interpolation logic for default category', () => {
    const factor18 = interpolateTermFactor(defaultFactors, 18, 'default');
    // Midpoint between 1.0 and 0.88
    expect(factor18).toBe(0.94);
  });

  it('applies 50% minimum rule for non-CAS extrapolation', () => {
    const factor48 = interpolateTermFactor(defaultFactors, 48, 'default');
    // Extrapolated from 24->36 trend, but minimum is 0.78 * 0.5 = 0.39
    expect(factor48).toBeGreaterThanOrEqual(0.78 * 0.5);
  });

  it('handles CNO category with standard rules', () => {
    const factor30 = interpolateTermFactor(cnoFactors, 30, 'cno');
    // Midpoint between 0.92 and 0.85
    expect(round4(factor30)).toBe(0.885);
  });
});

describe('Term Factor - Edge Cases', () => {
  const termFactors = new Map<number, number>([
    [12, 1.0],
    [36, 0.8],
    [60, 0.6],
  ]);

  it('handles non-contiguous term points', () => {
    // 24 months: between 12 and 36
    const factor24 = interpolateTermFactor(termFactors, 24, 'default');
    // Linear interpolation: 1.0 + (0.8-1.0) * (24-12)/(36-12) = 0.9
    expect(factor24).toBe(0.9);
  });

  it('handles very long terms', () => {
    const factor120 = interpolateTermFactor(termFactors, 120, 'default');
    // Should extrapolate but not go below 50% of last factor
    expect(factor120).toBeGreaterThanOrEqual(0.6 * 0.5);
  });

  it('handles decimal term values', () => {
    const factor18_5 = interpolateTermFactor(termFactors, 18.5, 'default');
    // Should interpolate correctly
    expect(factor18_5).toBeGreaterThan(0.8);
    expect(factor18_5).toBeLessThan(1.0);
  });
});
