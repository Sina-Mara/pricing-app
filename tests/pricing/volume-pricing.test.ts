import { describe, it, expect } from 'vitest';
import {
  priceFromModel,
  priceFromLadders,
  boundsFromModel,
  geometricBounds,
  round4,
  type PricingModel,
  type Ladder,
} from '../../src/lib/pricing';

describe('Volume Pricing - Smooth Mode', () => {
  const smoothModel: PricingModel = {
    sku_id: 'test-sku',
    base_qty: 1,
    base_unit_price: 100,
    per_double_discount: 0.1, // 10% discount per doubling
    floor_unit_price: 50,
    steps: 10,
    mode: 'smooth',
    max_qty: 10000,
    breakpoints: null,
  };

  it('returns base price at base quantity', () => {
    const price = priceFromModel(smoothModel, 1);
    expect(price).toBe(100);
  });

  it('applies discount when quantity doubles', () => {
    const price = priceFromModel(smoothModel, 2);
    // After one doubling: 100 * 0.9 = 90
    expect(price).toBe(90);
  });

  it('applies compound discount for multiple doublings', () => {
    const price = priceFromModel(smoothModel, 4);
    // After two doublings: 100 * 0.9^2 = 81
    expect(price).toBe(81);
  });

  it('respects floor price', () => {
    // At very high quantities, price should not go below floor
    const price = priceFromModel(smoothModel, 1000000);
    expect(price).toBeGreaterThanOrEqual(50);
  });

  it('uses base price for quantities below base_qty', () => {
    const price = priceFromModel(smoothModel, 0.5);
    expect(price).toBe(100); // Should use base_qty = 1
  });

  it('calculates intermediate quantities correctly', () => {
    // qty=8 is 3 doublings from base_qty=1
    const price = priceFromModel(smoothModel, 8);
    // 100 * 0.9^3 = 72.9
    expect(price).toBe(72.9);
  });
});

describe('Volume Pricing - Stepped Mode', () => {
  const steppedModel: PricingModel = {
    sku_id: 'test-sku',
    base_qty: 10,
    base_unit_price: 100,
    per_double_discount: 0.15, // 15% discount per doubling
    floor_unit_price: 40,
    steps: 5,
    mode: 'stepped',
    max_qty: 1000,
    breakpoints: null, // Will use geometric bounds
  };

  it('returns base price in first tier', () => {
    const price = priceFromModel(steppedModel, 10);
    expect(price).toBe(100);
  });

  it('maintains same price within a tier', () => {
    const bounds = boundsFromModel(steppedModel);
    // Price should be same for all quantities within first tier
    const price1 = priceFromModel(steppedModel, bounds[0]);
    const price2 = priceFromModel(steppedModel, bounds[1] - 0.1);
    expect(price1).toBe(price2);
  });

  it('drops price at tier boundary', () => {
    const bounds = boundsFromModel(steppedModel);
    const priceBefore = priceFromModel(steppedModel, bounds[1] - 0.1);
    const priceAfter = priceFromModel(steppedModel, bounds[1]);
    expect(priceAfter).toBeLessThan(priceBefore);
  });
});

describe('Volume Pricing - Manual Mode with Ladders', () => {
  const ladders: Ladder[] = [
    { sku_id: 'test', min_qty: 1, max_qty: 10, unit_price: 100 },
    { sku_id: 'test', min_qty: 11, max_qty: 50, unit_price: 90 },
    { sku_id: 'test', min_qty: 51, max_qty: 100, unit_price: 80 },
    { sku_id: 'test', min_qty: 101, max_qty: null, unit_price: 70 },
  ];

  it('returns correct price for first tier', () => {
    expect(priceFromLadders(ladders, 1)).toBe(100);
    expect(priceFromLadders(ladders, 5)).toBe(100);
    expect(priceFromLadders(ladders, 10)).toBe(100);
  });

  it('returns correct price for second tier', () => {
    expect(priceFromLadders(ladders, 11)).toBe(90);
    expect(priceFromLadders(ladders, 30)).toBe(90);
    expect(priceFromLadders(ladders, 50)).toBe(90);
  });

  it('returns correct price for third tier', () => {
    expect(priceFromLadders(ladders, 51)).toBe(80);
    expect(priceFromLadders(ladders, 75)).toBe(80);
    expect(priceFromLadders(ladders, 100)).toBe(80);
  });

  it('returns correct price for unlimited tier', () => {
    expect(priceFromLadders(ladders, 101)).toBe(70);
    expect(priceFromLadders(ladders, 1000)).toBe(70);
    expect(priceFromLadders(ladders, 100000)).toBe(70);
  });

  it('throws error for empty ladders', () => {
    expect(() => priceFromLadders([], 10)).toThrow('No ladder defined');
  });
});

describe('Geometric Bounds', () => {
  it('generates correct number of steps', () => {
    const bounds = geometricBounds(1, 1000, 5);
    expect(bounds.length).toBe(5);
  });

  it('starts at base quantity', () => {
    const bounds = geometricBounds(10, 1000, 5);
    expect(bounds[0]).toBe(10);
  });

  it('ends at max quantity', () => {
    const bounds = geometricBounds(10, 1000, 5);
    expect(bounds[bounds.length - 1]).toBe(1000);
  });

  it('creates geometric progression', () => {
    const bounds = geometricBounds(1, 16, 5);
    // Ratio should be 2 (16^(1/4) = 2)
    expect(bounds[0]).toBe(1);
    expect(round4(bounds[1])).toBe(2);
    expect(round4(bounds[2])).toBe(4);
    expect(round4(bounds[3])).toBe(8);
    expect(bounds[4]).toBe(16);
  });

  it('handles equal base and max', () => {
    const bounds = geometricBounds(100, 100, 5);
    expect(bounds).toEqual([100, 100]);
  });

  it('enforces minimum of 2 steps', () => {
    const bounds = geometricBounds(1, 100, 1);
    expect(bounds.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Bounds From Model', () => {
  it('uses custom breakpoints when provided', () => {
    const model: PricingModel = {
      sku_id: 'test',
      base_qty: 1,
      base_unit_price: 100,
      per_double_discount: 0.1,
      floor_unit_price: 50,
      steps: 10,
      mode: 'stepped',
      max_qty: 1000,
      breakpoints: [1, 10, 50, 100, 500],
    };

    const bounds = boundsFromModel(model);
    expect(bounds).toContain(1);
    expect(bounds).toContain(10);
    expect(bounds).toContain(50);
    expect(bounds).toContain(100);
    expect(bounds).toContain(500);
    expect(bounds).toContain(1000); // max_qty should be added
  });

  it('generates geometric bounds for smooth mode', () => {
    const model: PricingModel = {
      sku_id: 'test',
      base_qty: 10,
      base_unit_price: 100,
      per_double_discount: 0.1,
      floor_unit_price: 50,
      steps: 5,
      mode: 'smooth',
      max_qty: 1000,
      breakpoints: null,
    };

    const bounds = boundsFromModel(model);
    expect(bounds.length).toBe(5);
    expect(bounds[0]).toBe(10);
    expect(bounds[bounds.length - 1]).toBe(1000);
  });
});
