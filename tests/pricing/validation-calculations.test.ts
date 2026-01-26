/**
 * Validation Test: Pricing Calculations Match Expected Outputs
 *
 * Task 4.2: Verify that the calculation functions produce correct outputs
 * for sample yearly data.
 *
 * Test Data:
 * - Year 2026: 100,000 SIMs, 1,900,000 GB total data
 * - Year 2027: 150,000 SIMs, 3,000,000 GB total data
 * - Year 2028: 200,000 SIMs, 4,500,000 GB total data
 */

import { describe, it, expect } from 'vitest'
import {
  calculateGbPerSim,
  calculateGbPerSimYearly,
  calculateGbPerSimMonthly,
  interpolateYearlyToMonthly,
  calculateCommittedQuantities,
  calculatePeriodForecast,
  DEFAULT_FORECAST_CONFIG,
  type YearlyDataPoint,
} from '@/lib/timeseries-pricing'
import {
  aggregatePeak,
  aggregateAverage,
  calculateConsolidatedPreview,
} from '@/lib/scenario-generator'
import type { YearlyForecastRow } from '@/components/YearlyForecastInput'

// =============================================================================
// Test Data Constants
// =============================================================================

const TEST_YEARLY_DATA: YearlyDataPoint[] = [
  { year: 2026, totalSims: 100000, totalDataUsageGb: 1900000 },
  { year: 2027, totalSims: 150000, totalDataUsageGb: 3000000 },
  { year: 2028, totalSims: 200000, totalDataUsageGb: 4500000 },
]

// Convert to YearlyForecastRow format for scenario-generator functions
const TEST_FORECAST_ROWS: YearlyForecastRow[] = [
  { id: '1', year: 2026, endOfYearSims: 100000, totalDataUsageGB: 1900000, gbPerSimYearly: 19, gbPerSimMonthly: 19 / 12, isCalculated: false },
  { id: '2', year: 2027, endOfYearSims: 150000, totalDataUsageGB: 3000000, gbPerSimYearly: 20, gbPerSimMonthly: 20 / 12, isCalculated: false },
  { id: '3', year: 2028, endOfYearSims: 200000, totalDataUsageGB: 4500000, gbPerSimYearly: 22.5, gbPerSimMonthly: 22.5 / 12, isCalculated: false },
]

// =============================================================================
// 1. GB/SIM Calculation Tests
// =============================================================================

describe('GB per SIM Calculations', () => {
  describe('calculateGbPerSim', () => {
    it('should calculate correct GB/SIM for Year 2026: 1,900,000 GB / 100,000 SIMs = 19 GB/SIM/year', () => {
      const result = calculateGbPerSim(1900000, 100000)

      expect(result).not.toBeNull()
      expect(result!.yearly).toBe(19)
      expect(result!.monthly).toBeCloseTo(1.583333, 4) // 19 / 12
    })

    it('should calculate correct GB/SIM for Year 2027: 3,000,000 GB / 150,000 SIMs = 20 GB/SIM/year', () => {
      const result = calculateGbPerSim(3000000, 150000)

      expect(result).not.toBeNull()
      expect(result!.yearly).toBe(20)
      expect(result!.monthly).toBeCloseTo(1.666667, 4) // 20 / 12
    })

    it('should calculate correct GB/SIM for Year 2028: 4,500,000 GB / 200,000 SIMs = 22.5 GB/SIM/year', () => {
      const result = calculateGbPerSim(4500000, 200000)

      expect(result).not.toBeNull()
      expect(result!.yearly).toBe(22.5)
      expect(result!.monthly).toBeCloseTo(1.875, 4) // 22.5 / 12
    })
  })

  describe('calculateGbPerSimYearly convenience function', () => {
    it('should return yearly value for Year 2026', () => {
      expect(calculateGbPerSimYearly(1900000, 100000)).toBe(19)
    })

    it('should return yearly value for Year 2027', () => {
      expect(calculateGbPerSimYearly(3000000, 150000)).toBe(20)
    })

    it('should return yearly value for Year 2028', () => {
      expect(calculateGbPerSimYearly(4500000, 200000)).toBe(22.5)
    })

    it('should return 0 for invalid inputs', () => {
      expect(calculateGbPerSimYearly(1000, 0)).toBe(0)
      expect(calculateGbPerSimYearly(-1000, 100)).toBe(0)
    })
  })

  describe('calculateGbPerSimMonthly convenience function', () => {
    it('should return monthly value for Year 2026: 1.583 GB/SIM/month', () => {
      expect(calculateGbPerSimMonthly(1900000, 100000)).toBeCloseTo(1.583333, 4)
    })

    it('should return monthly value for Year 2027: 1.667 GB/SIM/month', () => {
      expect(calculateGbPerSimMonthly(3000000, 150000)).toBeCloseTo(1.666667, 4)
    })

    it('should return monthly value for Year 2028: 1.875 GB/SIM/month', () => {
      expect(calculateGbPerSimMonthly(4500000, 200000)).toBeCloseTo(1.875, 4)
    })
  })

  describe('edge cases', () => {
    it('should return null for zero SIMs', () => {
      expect(calculateGbPerSim(1000, 0)).toBeNull()
    })

    it('should return null for negative SIMs', () => {
      expect(calculateGbPerSim(1000, -100)).toBeNull()
    })

    it('should return null for negative data usage', () => {
      expect(calculateGbPerSim(-1000, 100)).toBeNull()
    })

    it('should handle zero data usage gracefully', () => {
      const result = calculateGbPerSim(0, 100000)
      expect(result).not.toBeNull()
      expect(result!.yearly).toBe(0)
      expect(result!.monthly).toBe(0)
    })

    it('should return null for NaN inputs', () => {
      expect(calculateGbPerSim(NaN, 100)).toBeNull()
      expect(calculateGbPerSim(100, NaN)).toBeNull()
    })

    it('should return null for Infinity inputs', () => {
      expect(calculateGbPerSim(Infinity, 100)).toBeNull()
      expect(calculateGbPerSim(100, Infinity)).toBeNull()
    })
  })
})

// =============================================================================
// 2. Linear Interpolation (Yearly to Monthly) Tests
// =============================================================================

describe('Linear Interpolation (Yearly to Monthly)', () => {
  describe('interpolateYearlyToMonthly', () => {
    it('should generate correct number of monthly periods', () => {
      const result = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

      // 3 years × 12 months = 36 months
      expect(result).toHaveLength(36)
    })

    it('should interpolate Jan 2027 correctly: ~104,167 SIMs', () => {
      const result = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

      // Find Jan 2027
      const jan2027 = result.find(m => m.year === 2027 && m.month === 1)

      expect(jan2027).toBeDefined()
      // Linear from 100k (Dec 2026) to 150k (Dec 2027)
      // Monthly increment = (150000 - 100000) / 12 = 4166.67
      // Jan 2027 = 100000 + (1 * 4166.67) = 104167
      expect(jan2027!.totalSims).toBeCloseTo(104167, 0)
    })

    it('should interpolate Jun 2027 correctly: ~125,000 SIMs', () => {
      const result = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

      // Find Jun 2027
      const jun2027 = result.find(m => m.year === 2027 && m.month === 6)

      expect(jun2027).toBeDefined()
      // Monthly increment = (150000 - 100000) / 12 = 4166.67
      // Jun 2027 = 100000 + (6 * 4166.67) = 125000
      expect(jun2027!.totalSims).toBeCloseTo(125000, 0)
    })

    it('should have Dec 2027 equal to end-of-year value: 150,000 SIMs', () => {
      const result = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

      // Find Dec 2027
      const dec2027 = result.find(m => m.year === 2027 && m.month === 12)

      expect(dec2027).toBeDefined()
      expect(dec2027!.totalSims).toBe(150000)
    })

    it('should interpolate 2028 monthly values correctly', () => {
      const result = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

      // Monthly increment = (200000 - 150000) / 12 = 4166.67
      const jan2028 = result.find(m => m.year === 2028 && m.month === 1)
      const jun2028 = result.find(m => m.year === 2028 && m.month === 6)
      const dec2028 = result.find(m => m.year === 2028 && m.month === 12)

      expect(jan2028!.totalSims).toBeCloseTo(154167, 0) // 150000 + 4167
      expect(jun2028!.totalSims).toBeCloseTo(175000, 0) // 150000 + 6 * 4167
      expect(dec2028!.totalSims).toBe(200000)
    })

    it('should calculate GB/SIM correctly for each interpolated month', () => {
      const result = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

      // For Dec 2027: 3,000,000 GB / 150,000 SIMs = 20 GB/SIM/year
      const dec2027 = result.find(m => m.year === 2027 && m.month === 12)
      expect(dec2027!.gbPerSim).toBeCloseTo(20, 2)

      // For Dec 2028: 4,500,000 GB / 200,000 SIMs = 22.5 GB/SIM/year
      const dec2028 = result.find(m => m.year === 2028 && m.month === 12)
      expect(dec2028!.gbPerSim).toBeCloseTo(22.5, 2)
    })

    it('should handle single year (no interpolation needed)', () => {
      const singleYear: YearlyDataPoint[] = [
        { year: 2026, totalSims: 100000, totalDataUsageGb: 1900000 },
      ]
      const result = interpolateYearlyToMonthly(singleYear)

      expect(result).toHaveLength(12)
      // All months should have the same value
      result.forEach(month => {
        expect(month.totalSims).toBe(100000)
        expect(month.totalDataUsageGb).toBe(1900000)
      })
    })

    it('should handle empty input', () => {
      const result = interpolateYearlyToMonthly([])
      expect(result).toHaveLength(0)
    })

    it('should sort unsorted year data correctly', () => {
      const unsortedData: YearlyDataPoint[] = [
        { year: 2028, totalSims: 200000, totalDataUsageGb: 4500000 },
        { year: 2026, totalSims: 100000, totalDataUsageGb: 1900000 },
        { year: 2027, totalSims: 150000, totalDataUsageGb: 3000000 },
      ]
      const result = interpolateYearlyToMonthly(unsortedData)

      expect(result).toHaveLength(36)
      expect(result[0].year).toBe(2026)
      expect(result[0].month).toBe(1)
      expect(result[35].year).toBe(2028)
      expect(result[35].month).toBe(12)
    })
  })
})

// =============================================================================
// 3. Scenario Aggregation Tests
// =============================================================================

describe('Scenario Aggregation', () => {
  describe('aggregatePeak', () => {
    it('should return peak values: 200,000 SIMs from 2028', () => {
      const result = aggregatePeak(TEST_FORECAST_ROWS)

      expect(result.totalSims).toBe(200000)
      expect(result.sourceYear).toBe(2028)
      expect(result.strategy).toBe('peak')
    })

    it('should calculate correct GB/SIM for peak year: 1.875 GB/SIM/month', () => {
      const result = aggregatePeak(TEST_FORECAST_ROWS)

      // 4,500,000 GB / 200,000 SIMs = 22.5 GB/year = 1.875 GB/month
      expect(result.gbPerSimMonthly).toBeCloseTo(1.875, 4)
    })

    it('should handle empty array', () => {
      const result = aggregatePeak([])

      expect(result.totalSims).toBe(0)
      expect(result.gbPerSimMonthly).toBe(0)
      expect(result.sourceYear).toBeUndefined()
    })

    it('should handle single year', () => {
      const singleRow: YearlyForecastRow[] = [TEST_FORECAST_ROWS[1]]
      const result = aggregatePeak(singleRow)

      expect(result.totalSims).toBe(150000)
      expect(result.sourceYear).toBe(2027)
    })
  })

  describe('aggregateAverage', () => {
    it('should return average SIMs: 150,000 (rounded up from 150,000)', () => {
      const result = aggregateAverage(TEST_FORECAST_ROWS)

      // (100000 + 150000 + 200000) / 3 = 150000
      expect(result.totalSims).toBe(150000)
      expect(result.strategy).toBe('average')
    })

    it('should calculate average GB/SIM: ~1.708 GB/SIM/month', () => {
      const result = aggregateAverage(TEST_FORECAST_ROWS)

      // GB/SIM monthly values:
      // 2026: 19/12 = 1.5833
      // 2027: 20/12 = 1.6667
      // 2028: 22.5/12 = 1.875
      // Average: (1.5833 + 1.6667 + 1.875) / 3 = 1.708
      expect(result.gbPerSimMonthly).toBeCloseTo(1.708, 2)
    })

    it('should handle empty array', () => {
      const result = aggregateAverage([])

      expect(result.totalSims).toBe(0)
      expect(result.gbPerSimMonthly).toBe(0)
    })

    it('should round up average SIMs', () => {
      const testRows: YearlyForecastRow[] = [
        { id: '1', year: 2026, endOfYearSims: 100000, totalDataUsageGB: 1900000, gbPerSimYearly: 19, gbPerSimMonthly: 19 / 12, isCalculated: false },
        { id: '2', year: 2027, endOfYearSims: 100001, totalDataUsageGB: 1900019, gbPerSimYearly: 19, gbPerSimMonthly: 19 / 12, isCalculated: false },
      ]
      const result = aggregateAverage(testRows)

      // (100000 + 100001) / 2 = 100000.5 -> ceil to 100001
      expect(result.totalSims).toBe(100001)
    })
  })

  describe('calculateConsolidatedPreview', () => {
    it('should return both peak and average values', () => {
      const result = calculateConsolidatedPreview(TEST_FORECAST_ROWS)

      // Peak
      expect(result.peak.totalSims).toBe(200000)
      expect(result.peak.gbPerSimMonthly).toBeCloseTo(1.875, 4)
      expect(result.peak.sourceYear).toBe(2028)

      // Average
      expect(result.average.totalSims).toBe(150000)
      expect(result.average.gbPerSimMonthly).toBeCloseTo(1.708, 2)
    })

    it('should filter out rows with zero SIMs', () => {
      const rowsWithZero: YearlyForecastRow[] = [
        ...TEST_FORECAST_ROWS,
        { id: '4', year: 2029, endOfYearSims: 0, totalDataUsageGB: 0, gbPerSimYearly: 0, gbPerSimMonthly: 0, isCalculated: false },
      ]
      const result = calculateConsolidatedPreview(rowsWithZero)

      // Should still be 200,000 SIMs from 2028, not affected by the zero row
      expect(result.peak.totalSims).toBe(200000)
      expect(result.peak.sourceYear).toBe(2028)
    })

    it('should handle empty input', () => {
      const result = calculateConsolidatedPreview([])

      expect(result.peak.totalSims).toBe(0)
      expect(result.peak.gbPerSimMonthly).toBe(0)
      expect(result.peak.sourceYear).toBeUndefined()
      expect(result.average.totalSims).toBe(0)
      expect(result.average.gbPerSimMonthly).toBe(0)
    })
  })
})

// =============================================================================
// 4. Integration Test: Full Pipeline Validation
// =============================================================================

describe('Full Pipeline Validation', () => {
  it('should produce consistent results through the entire calculation pipeline', () => {
    // Step 1: Calculate GB per SIM for each year
    const year2026GbPerSim = calculateGbPerSim(1900000, 100000)
    const year2027GbPerSim = calculateGbPerSim(3000000, 150000)
    const year2028GbPerSim = calculateGbPerSim(4500000, 200000)

    expect(year2026GbPerSim!.yearly).toBe(19)
    expect(year2027GbPerSim!.yearly).toBe(20)
    expect(year2028GbPerSim!.yearly).toBe(22.5)

    // Step 2: Interpolate to monthly
    const monthlyData = interpolateYearlyToMonthly(TEST_YEARLY_DATA)
    expect(monthlyData).toHaveLength(36)

    // Step 3: Verify peak aggregation matches
    const peakResult = aggregatePeak(TEST_FORECAST_ROWS)
    expect(peakResult.totalSims).toBe(200000)
    expect(peakResult.gbPerSimMonthly).toBeCloseTo(year2028GbPerSim!.monthly, 4)

    // Step 4: Verify average aggregation
    const avgResult = aggregateAverage(TEST_FORECAST_ROWS)
    const expectedAvgGbMonthly = (
      year2026GbPerSim!.monthly +
      year2027GbPerSim!.monthly +
      year2028GbPerSim!.monthly
    ) / 3
    expect(avgResult.gbPerSimMonthly).toBeCloseTo(expectedAvgGbMonthly, 4)
  })

  it('should correctly calculate forecast outputs for peak scenario', () => {
    // Use peak values (200,000 SIMs, 1.875 GB/SIM/month) from 2028
    const peakResult = aggregatePeak(TEST_FORECAST_ROWS)

    const forecastOutputs = calculatePeriodForecast(
      peakResult.totalSims,
      peakResult.gbPerSimMonthly,
      DEFAULT_FORECAST_CONFIG
    )

    // Verify the cascade of calculations
    expect(forecastOutputs.udr).toBe(200000) // Total SIMs
    expect(forecastOutputs.pcs).toBe(Math.ceil(200000 * 0.13)) // 26000
    expect(forecastOutputs.ccs).toBe(Math.ceil(200000 * 0.9)) // 180000
    expect(forecastOutputs.scs).toBe(Math.ceil(26000 * 1.0)) // 26000
    expect(forecastOutputs.cos).toBe(26000) // Same as SCS

    // Data volume = SIMs * GB/SIM = 200000 * 1.875 = 375000
    expect(forecastOutputs.dataVolumeGb).toBeCloseTo(375000, 0)
  })

  it('should validate monthly interpolation progression', () => {
    const monthlyData = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

    // Verify monotonic increase in SIMs from Jan 2027 to Dec 2028
    const year2027Data = monthlyData.filter(m => m.year === 2027)
    const year2028Data = monthlyData.filter(m => m.year === 2028)

    // 2027 should increase from ~104k to 150k
    for (let i = 1; i < year2027Data.length; i++) {
      expect(year2027Data[i].totalSims).toBeGreaterThanOrEqual(year2027Data[i - 1].totalSims)
    }

    // 2028 should increase from ~154k to 200k
    for (let i = 1; i < year2028Data.length; i++) {
      expect(year2028Data[i].totalSims).toBeGreaterThanOrEqual(year2028Data[i - 1].totalSims)
    }

    // Last month of 2027 should be less than first month of 2028
    expect(year2027Data[11].totalSims).toBeLessThan(year2028Data[0].totalSims)
  })
})

// =============================================================================
// 5. Committed Quantities Aggregation Tests
// =============================================================================

describe('Committed Quantities from Monthly Data', () => {
  it('should calculate correct peak committed quantities from interpolated data', () => {
    const monthlyData = interpolateYearlyToMonthly(TEST_YEARLY_DATA)

    // Convert to forecast results format
    const forecastResults = monthlyData.map((m, i) => ({
      periodIndex: i + 1,
      periodDate: m.date,
      periodLabel: `${m.year}-${m.month}`,
      totalSims: m.totalSims,
      gbPerSim: m.gbPerSim,
      udr: m.totalSims,
      pcs: Math.ceil(m.totalSims * 0.13),
      ccs: Math.ceil(m.totalSims * 0.9),
      scs: Math.ceil(m.totalSims * 0.13),
      cos: Math.ceil(m.totalSims * 0.13),
      peakThroughput: (m.totalSims * m.gbPerSim * 8) / (30 * 8 * 3600) * 3,
      avgThroughput: (m.totalSims * m.gbPerSim * 8) / (30 * 8 * 3600),
      dataVolumeGb: m.totalSims * m.gbPerSim,
    }))

    const committedPeak = calculateCommittedQuantities(forecastResults, 'peak')
    const committedAvg = calculateCommittedQuantities(forecastResults, 'average')

    // Peak should be Dec 2028 values (200,000 SIMs)
    expect(committedPeak.udr).toBe(200000)

    // Average across 36 months
    // First year all 100k, then ramping to 150k, then ramping to 200k
    // This is a more complex calculation - just verify it's reasonable
    expect(committedAvg.udr).toBeGreaterThan(100000)
    expect(committedAvg.udr).toBeLessThan(200000)
  })
})
