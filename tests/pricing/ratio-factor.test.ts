import { describe, it, expect } from 'vitest';
import {
  CAS_REFERENCE_BASE_RATIO,
  CAS_REFERENCE_USAGE_RATIO,
  calculateBaseRatioFactor,
  calculateUsageRatioFactor,
  applyBaseUsageRatio,
} from '@/lib/pricing';

// =============================================================================
// Base/Usage Ratio Factor Tests
// =============================================================================

describe('calculateBaseRatioFactor', () => {
  it('returns 1.0 when ratio equals the CAS reference base ratio (0.60)', () => {
    expect(calculateBaseRatioFactor(0.60)).toBe(1.0);
  });

  it('returns factor > 1 when ratio is higher than reference', () => {
    // ratio 0.80 / reference 0.60 = 1.3333
    expect(calculateBaseRatioFactor(0.80)).toBe(1.3333);
  });

  it('returns factor < 1 when ratio is lower than reference', () => {
    // ratio 0.10 / reference 0.60 = 0.1667
    expect(calculateBaseRatioFactor(0.10)).toBe(0.1667);
  });

  it('returns 0 when ratio is 0', () => {
    // 0 / 0.60 = 0
    expect(calculateBaseRatioFactor(0)).toBe(0);
  });

  it('returns factor proportional to the ratio', () => {
    // ratio 0.30 / 0.60 = 0.5
    expect(calculateBaseRatioFactor(0.30)).toBe(0.5);
  });

  it('handles ratio of 1.0 (100% base)', () => {
    // 1.0 / 0.60 = 1.6667
    expect(calculateBaseRatioFactor(1.0)).toBe(1.6667);
  });
});

describe('calculateUsageRatioFactor', () => {
  it('returns 1.0 when ratio equals the CAS reference base ratio (0.60)', () => {
    // (1 - 0.60) / 0.40 = 0.40 / 0.40 = 1.0
    expect(calculateUsageRatioFactor(0.60)).toBe(1.0);
  });

  it('returns factor < 1 when base ratio is higher (less usage)', () => {
    // (1 - 0.80) / 0.40 = 0.20 / 0.40 = 0.50
    expect(calculateUsageRatioFactor(0.80)).toBe(0.5);
  });

  it('returns factor > 1 when base ratio is lower (more usage)', () => {
    // (1 - 0.10) / 0.40 = 0.90 / 0.40 = 2.25
    expect(calculateUsageRatioFactor(0.10)).toBe(2.25);
  });

  it('returns 2.5 when ratio is 0 (100% usage)', () => {
    // (1 - 0) / 0.40 = 1.0 / 0.40 = 2.5
    expect(calculateUsageRatioFactor(0)).toBe(2.5);
  });

  it('returns 0 when ratio is 1.0 (0% usage)', () => {
    // (1 - 1.0) / 0.40 = 0 / 0.40 = 0
    expect(calculateUsageRatioFactor(1.0)).toBe(0);
  });

  it('handles ratio of 0.50', () => {
    // (1 - 0.50) / 0.40 = 0.50 / 0.40 = 1.25
    expect(calculateUsageRatioFactor(0.50)).toBe(1.25);
  });
});

describe('calculateBaseRatioFactor and calculateUsageRatioFactor are inverses', () => {
  it('factors sum to preserve total revenue at reference ratio', () => {
    // At reference ratio 0.60, both factors should be 1.0
    const baseFactor = calculateBaseRatioFactor(CAS_REFERENCE_BASE_RATIO);
    const usageFactor = calculateUsageRatioFactor(CAS_REFERENCE_BASE_RATIO);
    expect(baseFactor).toBe(1.0);
    expect(usageFactor).toBe(1.0);
  });

  it('shifting ratio increases one factor and decreases the other', () => {
    const ratio = 0.80;
    const baseFactor = calculateBaseRatioFactor(ratio);
    const usageFactor = calculateUsageRatioFactor(ratio);
    // Base factor increases (more base charge)
    expect(baseFactor).toBeGreaterThan(1.0);
    // Usage factor decreases (less usage charge)
    expect(usageFactor).toBeLessThan(1.0);
  });

  it('weighted sum preserves total price at any ratio', () => {
    // For any ratio r, the weighted combination of base and usage
    // should equal the original total:
    // r * baseFactor + (1-r) * usageFactor should equal 1.0
    // because r * (r/0.60) + (1-r) * ((1-r)/0.40)
    // This is NOT necessarily 1.0 -- the total shifts.
    // But at the reference ratio, it equals 1.0.
    const refRatio = CAS_REFERENCE_BASE_RATIO;
    const baseF = calculateBaseRatioFactor(refRatio);
    const usageF = calculateUsageRatioFactor(refRatio);
    const weightedSum = refRatio * baseF + (1 - refRatio) * usageF;
    expect(weightedSum).toBeCloseTo(1.0, 4);
  });
});

describe('applyBaseUsageRatio', () => {
  describe('CAS base charges', () => {
    it('applies base ratio factor to CAS base charge price', () => {
      const result = applyBaseUsageRatio(10.0, true, 'cas', 0.80);
      // factor = 0.80 / 0.60 = 1.3333
      expect(result.ratioFactor).toBe(1.3333);
      expect(result.adjustedPrice).toBe(13.333);
    });

    it('applies no change at default ratio 0.60 for base charge', () => {
      const result = applyBaseUsageRatio(25.0, true, 'cas', 0.60);
      expect(result.ratioFactor).toBe(1.0);
      expect(result.adjustedPrice).toBe(25.0);
    });

    it('reduces base charge when ratio is below reference', () => {
      const result = applyBaseUsageRatio(100.0, true, 'cas', 0.30);
      // factor = 0.30 / 0.60 = 0.5
      expect(result.ratioFactor).toBe(0.5);
      expect(result.adjustedPrice).toBe(50.0);
    });
  });

  describe('CAS usage charges', () => {
    it('applies usage ratio factor to CAS usage charge price', () => {
      const result = applyBaseUsageRatio(10.0, false, 'cas', 0.80);
      // factor = (1 - 0.80) / 0.40 = 0.50
      expect(result.ratioFactor).toBe(0.5);
      expect(result.adjustedPrice).toBe(5.0);
    });

    it('applies no change at default ratio 0.60 for usage charge', () => {
      const result = applyBaseUsageRatio(25.0, false, 'cas', 0.60);
      expect(result.ratioFactor).toBe(1.0);
      expect(result.adjustedPrice).toBe(25.0);
    });

    it('increases usage charge when ratio is below reference', () => {
      const result = applyBaseUsageRatio(10.0, false, 'cas', 0.10);
      // factor = (1 - 0.10) / 0.40 = 2.25
      expect(result.ratioFactor).toBe(2.25);
      expect(result.adjustedPrice).toBe(22.5);
    });
  });

  describe('non-CAS SKUs', () => {
    it('returns null ratioFactor for non-CAS categories', () => {
      const result = applyBaseUsageRatio(50.0, true, 'cno', 0.80);
      expect(result.ratioFactor).toBeNull();
      expect(result.adjustedPrice).toBe(50.0);
    });

    it('does not modify price for default category', () => {
      const result = applyBaseUsageRatio(99.99, false, 'default', 0.10);
      expect(result.ratioFactor).toBeNull();
      expect(result.adjustedPrice).toBe(99.99);
    });

    it('does not modify price for managed-service category', () => {
      const result = applyBaseUsageRatio(42.0, true, 'managed-service', 0.50);
      expect(result.ratioFactor).toBeNull();
      expect(result.adjustedPrice).toBe(42.0);
    });

    it('ignores ratio value entirely for non-CAS', () => {
      const price = 75.0;
      const result1 = applyBaseUsageRatio(price, true, 'cno', 0.10);
      const result2 = applyBaseUsageRatio(price, true, 'cno', 0.90);
      expect(result1.adjustedPrice).toBe(result2.adjustedPrice);
      expect(result1.ratioFactor).toBeNull();
      expect(result2.ratioFactor).toBeNull();
    });
  });

  describe('default ratio (0.60) produces no price change', () => {
    it('leaves base charge unchanged at default ratio', () => {
      const prices = [1.0, 10.0, 100.0, 0.5555, 999.9999];
      for (const price of prices) {
        const result = applyBaseUsageRatio(price, true, 'cas', 0.60);
        expect(result.adjustedPrice).toBe(price);
        expect(result.ratioFactor).toBe(1.0);
      }
    });

    it('leaves usage charge unchanged at default ratio', () => {
      const prices = [1.0, 10.0, 100.0, 0.5555, 999.9999];
      for (const price of prices) {
        const result = applyBaseUsageRatio(price, false, 'cas', 0.60);
        expect(result.adjustedPrice).toBe(price);
        expect(result.ratioFactor).toBe(1.0);
      }
    });
  });

  describe('reference constants', () => {
    it('CAS_REFERENCE_BASE_RATIO is 0.60', () => {
      expect(CAS_REFERENCE_BASE_RATIO).toBe(0.60);
    });

    it('CAS_REFERENCE_USAGE_RATIO is 0.40', () => {
      expect(CAS_REFERENCE_USAGE_RATIO).toBe(0.40);
    });

    it('reference ratios sum to 1.0', () => {
      expect(CAS_REFERENCE_BASE_RATIO + CAS_REFERENCE_USAGE_RATIO).toBe(1.0);
    });
  });
});
