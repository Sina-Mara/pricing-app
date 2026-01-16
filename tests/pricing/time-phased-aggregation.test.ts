import { describe, it, expect } from 'vitest';
import {
  calculateTimePhaseQuantities,
  calculateTimeWeightedPrices,
  type PackageItem,
} from '../../src/lib/pricing';

describe('Time-Phased Quantity Aggregation', () => {
  it('creates single phase for items with same term', () => {
    const items: PackageItem[] = [
      { pkgId: 'pkg1', sku: 'SKU-A', quantity: 100, termMonths: 24 },
      { pkgId: 'pkg2', sku: 'SKU-A', quantity: 50, termMonths: 24 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const skuPhases = phases.get('SKU-A')!;

    // Should have only one phase: 1-24
    expect(skuPhases.size).toBe(1);
    expect(skuPhases.has('1-24')).toBe(true);

    const phase = skuPhases.get('1-24')!;
    expect(phase.totalQty).toBe(150); // 100 + 50
    expect(phase.items.length).toBe(2);
  });

  it('creates multiple phases for items with different terms', () => {
    const items: PackageItem[] = [
      { pkgId: 'pkg1', sku: 'SKU-A', quantity: 100, termMonths: 12 },
      { pkgId: 'pkg2', sku: 'SKU-A', quantity: 50, termMonths: 24 },
      { pkgId: 'pkg3', sku: 'SKU-A', quantity: 25, termMonths: 36 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const skuPhases = phases.get('SKU-A')!;

    // Should have three phases: 1-12, 13-24, 25-36
    expect(skuPhases.size).toBe(3);

    // Phase 1-12: all items active
    const phase1 = skuPhases.get('1-12')!;
    expect(phase1.totalQty).toBe(175); // 100 + 50 + 25
    expect(phase1.items.length).toBe(3);

    // Phase 13-24: pkg2 and pkg3 active
    const phase2 = skuPhases.get('13-24')!;
    expect(phase2.totalQty).toBe(75); // 50 + 25
    expect(phase2.items.length).toBe(2);

    // Phase 25-36: only pkg3 active
    const phase3 = skuPhases.get('25-36')!;
    expect(phase3.totalQty).toBe(25);
    expect(phase3.items.length).toBe(1);
  });

  it('handles multiple SKUs independently', () => {
    const items: PackageItem[] = [
      { pkgId: 'pkg1', sku: 'SKU-A', quantity: 100, termMonths: 24 },
      { pkgId: 'pkg1', sku: 'SKU-B', quantity: 200, termMonths: 12 },
    ];

    const phases = calculateTimePhaseQuantities(items);

    // SKU-A should have phases based on both terms (1-12, 13-24)
    const skuAPhases = phases.get('SKU-A')!;
    expect(skuAPhases.size).toBe(2);
    expect(skuAPhases.get('1-12')!.totalQty).toBe(100);
    expect(skuAPhases.get('13-24')!.totalQty).toBe(100);

    // SKU-B only has 12-month term, so only active in first phase
    const skuBPhases = phases.get('SKU-B')!;
    expect(skuBPhases.size).toBe(1);
    expect(skuBPhases.get('1-12')!.totalQty).toBe(200);
  });

  it('handles empty items array', () => {
    const phases = calculateTimePhaseQuantities([]);
    expect(phases.size).toBe(0);
  });
});

describe('Time-Weighted Price Calculation', () => {
  // Mock price function: simple tiered pricing
  const mockPriceFn = (sku: string, qty: number): number => {
    if (sku === 'SKU-A') {
      if (qty >= 100) return 8;
      if (qty >= 50) return 9;
      return 10;
    }
    return 10; // Default price
  };

  it('calculates simple weighted average for single package', () => {
    const items: PackageItem[] = [
      { pkgId: 'pkg1', sku: 'SKU-A', quantity: 100, termMonths: 24 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const weightedPrices = calculateTimeWeightedPrices(phases, mockPriceFn);

    const skuPrices = weightedPrices.get('SKU-A')!;
    const pkgData = skuPrices.get('pkg1_SKU-A')!;

    // Only one phase, so weighted price equals phase price
    expect(pkgData.finalPrice).toBe(8); // qty=100 -> price=8
  });

  it('calculates time-weighted average for multiple phases', () => {
    const items: PackageItem[] = [
      { pkgId: 'pkg1', sku: 'SKU-A', quantity: 50, termMonths: 12 },
      { pkgId: 'pkg2', sku: 'SKU-A', quantity: 50, termMonths: 24 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const weightedPrices = calculateTimeWeightedPrices(phases, mockPriceFn);

    // pkg1 (12-month term):
    // - Phase 1-12: qty=100 (50+50), price=8, duration=12
    // - Weighted price = 8 * 12 / 12 = 8
    const pkg1Data = weightedPrices.get('SKU-A')!.get('pkg1_SKU-A')!;
    expect(pkg1Data.finalPrice).toBe(8);
    expect(pkg1Data.totalWeight).toBe(12);

    // pkg2 (24-month term):
    // - Phase 1-12: qty=100, price=8, duration=12
    // - Phase 13-24: qty=50, price=9, duration=12
    // - Weighted price = (8*12 + 9*12) / 24 = 204/24 = 8.5
    const pkg2Data = weightedPrices.get('SKU-A')!.get('pkg2_SKU-A')!;
    expect(pkg2Data.finalPrice).toBe(8.5);
    expect(pkg2Data.totalWeight).toBe(24);
  });

  it('tracks phase information correctly', () => {
    const items: PackageItem[] = [
      { pkgId: 'pkg1', sku: 'SKU-A', quantity: 100, termMonths: 36 },
      { pkgId: 'pkg2', sku: 'SKU-A', quantity: 25, termMonths: 12 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const weightedPrices = calculateTimeWeightedPrices(phases, mockPriceFn);

    const pkgData = weightedPrices.get('SKU-A')!.get('pkg1_SKU-A')!;

    // pkg1 spans multiple phases
    expect(pkgData.phasesList.length).toBe(2);

    // First phase: 1-12, qty=125, price=8
    expect(pkgData.phasesList[0].phase).toBe('1-12');
    expect(pkgData.phasesList[0].totalQty).toBe(125);

    // Second phase: 13-36, qty=100, price=8
    expect(pkgData.phasesList[1].phase).toBe('13-36');
    expect(pkgData.phasesList[1].totalQty).toBe(100);
  });
});

describe('Time-Phased Aggregation - Real-World Scenarios', () => {
  // Realistic pricing tiers
  const realisticPriceFn = (sku: string, qty: number): number => {
    // Cennso_Sites pricing example
    if (sku === 'Cennso_Sites') {
      if (qty >= 20) return 450;
      if (qty >= 15) return 500;
      if (qty >= 10) return 550;
      if (qty >= 5) return 600;
      return 700;
    }
    // SMC_sessions pricing example (per 1000 sessions)
    if (sku === 'SMC_sessions') {
      if (qty >= 50000) return 0.05;
      if (qty >= 10000) return 0.08;
      if (qty >= 5000) return 0.12;
      return 0.20;
    }
    return 10;
  };

  it('handles existing contract + new contract scenario', () => {
    const items: PackageItem[] = [
      // Existing contract (shorter remaining term)
      { pkgId: 'EXISTING', sku: 'Cennso_Sites', quantity: 5, termMonths: 12 },
      // New production package
      { pkgId: 'PROD', sku: 'Cennso_Sites', quantity: 10, termMonths: 36 },
      // New scale-up package
      { pkgId: 'SCALEUP', sku: 'Cennso_Sites', quantity: 15, termMonths: 36 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const weightedPrices = calculateTimeWeightedPrices(phases, realisticPriceFn);

    // Phase 1-12: all packages active, qty = 5+10+15 = 30
    // Phase 13-36: PROD + SCALEUP active, qty = 10+15 = 25

    // EXISTING contract (12 months):
    // - Phase 1-12: qty=30 -> price=450 (tier >=20), 12 months
    const existingData = weightedPrices.get('Cennso_Sites')!.get('EXISTING_Cennso_Sites')!;
    expect(existingData.finalPrice).toBe(450);

    // PROD contract (36 months):
    // - Phase 1-12: qty=30 -> price=450, 12 months
    // - Phase 13-36: qty=25 -> price=450, 24 months
    // - Weighted = (450*12 + 450*24) / 36 = 450
    const prodData = weightedPrices.get('Cennso_Sites')!.get('PROD_Cennso_Sites')!;
    expect(prodData.finalPrice).toBe(450);
    expect(prodData.totalWeight).toBe(36);

    // SCALEUP contract (36 months): same weighted price
    const scaleupData = weightedPrices.get('Cennso_Sites')!.get('SCALEUP_Cennso_Sites')!;
    expect(scaleupData.finalPrice).toBe(450);
  });

  it('demonstrates volume discount benefit from aggregation', () => {
    const items: PackageItem[] = [
      // Two packages each below the 10K threshold individually
      { pkgId: 'PKG1', sku: 'SMC_sessions', quantity: 6000, termMonths: 24 },
      { pkgId: 'PKG2', sku: 'SMC_sessions', quantity: 8000, termMonths: 24 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const weightedPrices = calculateTimeWeightedPrices(phases, realisticPriceFn);

    // Combined qty = 14000, which gets the 10K+ tier price of 0.08
    // Individually, PKG1 (6000) would pay 0.12 and PKG2 (8000) would pay 0.12

    const pkg1Data = weightedPrices.get('SMC_sessions')!.get('PKG1_SMC_sessions')!;
    expect(pkg1Data.finalPrice).toBe(0.08); // Gets aggregated price, not 0.12

    const pkg2Data = weightedPrices.get('SMC_sessions')!.get('PKG2_SMC_sessions')!;
    expect(pkg2Data.finalPrice).toBe(0.08); // Gets aggregated price, not 0.12
  });

  it('handles phase transitions with price changes', () => {
    const items: PackageItem[] = [
      // Short-term package expires, reducing aggregated quantity
      { pkgId: 'SHORT', sku: 'SMC_sessions', quantity: 45000, termMonths: 12 },
      { pkgId: 'LONG', sku: 'SMC_sessions', quantity: 8000, termMonths: 36 },
    ];

    const phases = calculateTimePhaseQuantities(items);
    const weightedPrices = calculateTimeWeightedPrices(phases, realisticPriceFn);

    // Phase 1-12: qty=53000 -> price=0.05 (50K+ tier)
    // Phase 13-36: qty=8000 -> price=0.12 (5K+ tier, below 10K)

    // LONG contract weighted price:
    // - Phase 1-12: 12 months at 0.05
    // - Phase 13-36: 24 months at 0.12
    // - Weighted = (0.05*12 + 0.12*24) / 36 = (0.6 + 2.88) / 36 = 0.0967
    const longData = weightedPrices.get('SMC_sessions')!.get('LONG_SMC_sessions')!;
    expect(longData.finalPrice).toBeCloseTo(0.0967, 3);
    expect(longData.phasesList.length).toBe(2);
    expect(longData.phasesList[0].unitPrice).toBe(0.05);
    expect(longData.phasesList[1].unitPrice).toBe(0.12);
  });
});
