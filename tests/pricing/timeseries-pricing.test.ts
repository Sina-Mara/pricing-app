import { describe, it, expect } from 'vitest'
import {
  calculatePeriodForecast,
  calculateAllPeriodForecasts,
  calculateCommittedQuantities,
  generateForecastSummary,
  DEFAULT_FORECAST_CONFIG,
} from '@/lib/timeseries-pricing'
import type { ParsedTimeseriesData } from '@/types/database'

describe('timeseries-pricing', () => {
  describe('calculatePeriodForecast', () => {
    it('should calculate UDR equal to total SIMs', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      expect(result.udr).toBe(100000)
    })

    it('should calculate PCS as SIMs * takeRatePcsUdr', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      // 100000 * 0.13 = 13000
      expect(result.pcs).toBe(13000)
    })

    it('should calculate CCS as SIMs * takeRateCcsUdr', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      // 100000 * 0.9 = 90000
      expect(result.ccs).toBe(90000)
    })

    it('should calculate SCS as PCS * takeRateScsPcs', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      // 13000 * 1.0 = 13000
      expect(result.scs).toBe(13000)
    })

    it('should calculate CoS equal to SCS', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      expect(result.cos).toBe(result.scs)
    })

    it('should calculate data volume as SIMs * gbPerSim', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      expect(result.dataVolumeGb).toBe(190000)
    })

    it('should calculate average throughput correctly', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      // (190000 * 8) / (30 * 8 * 3600) = 1520000 / 864000 = 1.759...
      expect(result.avgThroughput).toBeCloseTo(1.759, 2)
    })

    it('should calculate peak throughput as avg * peakAverageRatio', () => {
      const result = calculatePeriodForecast(100000, 1.9, DEFAULT_FORECAST_CONFIG)
      expect(result.peakThroughput).toBeCloseTo(result.avgThroughput * 3, 2)
    })

    it('should handle zero SIMs', () => {
      const result = calculatePeriodForecast(0, 1.9, DEFAULT_FORECAST_CONFIG)
      expect(result.udr).toBe(0)
      expect(result.pcs).toBe(0)
      expect(result.ccs).toBe(0)
      expect(result.dataVolumeGb).toBe(0)
      expect(result.avgThroughput).toBe(0)
    })

    it('should use custom config values', () => {
      const customConfig = {
        ...DEFAULT_FORECAST_CONFIG,
        takeRatePcsUdr: 0.20, // 20%
        takeRateCcsUdr: 0.80, // 80%
      }
      const result = calculatePeriodForecast(100000, 1.9, customConfig)
      expect(result.pcs).toBe(20000)
      expect(result.ccs).toBe(80000)
    })
  })

  describe('calculateAllPeriodForecasts', () => {
    const createMockData = (simValues: number[], gbValues?: number[]): ParsedTimeseriesData => ({
      periods: simValues.map((_, i) => ({
        date: new Date(2025, i, 1),
        label: `Period ${i + 1}`,
      })),
      kpis: [
        { name: 'Total SIMs', values: simValues },
        ...(gbValues ? [{ name: 'GB per SIM', values: gbValues }] : []),
      ],
      granularity: 'monthly',
      startDate: new Date(2025, 0, 1),
      endDate: new Date(2025, simValues.length - 1, 1),
    })

    it('should calculate forecasts for all periods', () => {
      const data = createMockData([100000, 110000, 120000])
      const results = calculateAllPeriodForecasts(data)

      expect(results).toHaveLength(3)
      expect(results[0].totalSims).toBe(100000)
      expect(results[1].totalSims).toBe(110000)
      expect(results[2].totalSims).toBe(120000)
    })

    it('should use default GB/SIM when not provided', () => {
      const data = createMockData([100000, 110000])
      const results = calculateAllPeriodForecasts(data)

      expect(results[0].gbPerSim).toBe(1.9)
      expect(results[1].gbPerSim).toBe(1.9)
    })

    it('should use provided GB/SIM values', () => {
      const data = createMockData([100000, 110000], [2.0, 2.5])
      const results = calculateAllPeriodForecasts(data)

      expect(results[0].gbPerSim).toBe(2.0)
      expect(results[1].gbPerSim).toBe(2.5)
    })

    it('should skip periods with zero or missing SIMs', () => {
      const data = createMockData([100000, 0, 120000])
      const results = calculateAllPeriodForecasts(data)

      expect(results).toHaveLength(2)
      expect(results[0].totalSims).toBe(100000)
      expect(results[1].totalSims).toBe(120000)
    })

    it('should throw error if Total SIMs KPI is missing', () => {
      const data: ParsedTimeseriesData = {
        periods: [{ date: new Date(), label: 'P1' }],
        kpis: [{ name: 'Other KPI', values: [100] }],
        granularity: 'monthly',
        startDate: new Date(),
        endDate: new Date(),
      }

      expect(() => calculateAllPeriodForecasts(data)).toThrow('Total SIMs KPI not found')
    })
  })

  describe('calculateCommittedQuantities', () => {
    const createMockForecasts = (values: number[]): any[] =>
      values.map((v, i) => ({
        periodIndex: i + 1,
        periodDate: new Date(2025, i, 1),
        periodLabel: `Period ${i + 1}`,
        totalSims: v,
        gbPerSim: 1.9,
        udr: v,
        pcs: Math.ceil(v * 0.13),
        ccs: Math.ceil(v * 0.9),
        scs: Math.ceil(v * 0.13),
        cos: Math.ceil(v * 0.13),
        peakThroughput: (v * 1.9 * 8) / (30 * 8 * 3600) * 3,
        avgThroughput: (v * 1.9 * 8) / (30 * 8 * 3600),
        dataVolumeGb: v * 1.9,
      }))

    it('should calculate peak values', () => {
      const forecasts = createMockForecasts([100000, 150000, 120000])
      const result = calculateCommittedQuantities(forecasts, 'peak')

      expect(result.udr).toBe(150000)
    })

    it('should calculate average values', () => {
      const forecasts = createMockForecasts([100000, 150000, 130000])
      const result = calculateCommittedQuantities(forecasts, 'average')

      // Average = (100000 + 150000 + 130000) / 3 = 126666.67
      expect(result.udr).toBe(126667)
    })

    it('should calculate P90 values', () => {
      const forecasts = createMockForecasts([100000, 110000, 120000, 130000, 140000, 150000, 160000, 170000, 180000, 190000])
      const result = calculateCommittedQuantities(forecasts, 'p90')

      // P90 of 10 values
      expect(result.udr).toBeGreaterThanOrEqual(180000)
      expect(result.udr).toBeLessThanOrEqual(190000)
    })

    it('should calculate P95 values', () => {
      const forecasts = createMockForecasts([100000, 110000, 120000, 130000, 140000, 150000, 160000, 170000, 180000, 190000])
      const result = calculateCommittedQuantities(forecasts, 'p95')

      expect(result.udr).toBeGreaterThanOrEqual(185000)
    })

    it('should handle empty array', () => {
      const result = calculateCommittedQuantities([], 'peak')

      expect(result.udr).toBe(0)
      expect(result.pcs).toBe(0)
    })

    it('should handle single value', () => {
      const forecasts = createMockForecasts([100000])
      const result = calculateCommittedQuantities(forecasts, 'average')

      expect(result.udr).toBe(100000)
    })
  })

  describe('generateForecastSummary', () => {
    const createMockForecasts = (values: number[]): any[] =>
      values.map((v, i) => ({
        periodIndex: i + 1,
        periodDate: new Date(2025, i, 1),
        periodLabel: `Period ${i + 1}`,
        totalSims: v,
        gbPerSim: 1.9,
        udr: v,
        pcs: Math.ceil(v * 0.13),
        ccs: Math.ceil(v * 0.9),
        scs: Math.ceil(v * 0.13),
        cos: Math.ceil(v * 0.13),
        peakThroughput: 0.5,
        avgThroughput: 0.17,
        dataVolumeGb: v * 1.9,
      }))

    it('should calculate summary statistics', () => {
      const forecasts = createMockForecasts([100000, 120000, 140000])
      const summary = generateForecastSummary(forecasts)

      expect(summary.totalPeriods).toBe(3)
      expect(summary.sims.min).toBe(100000)
      expect(summary.sims.max).toBe(140000)
      expect(summary.sims.avg).toBe(120000)
    })

    it('should calculate growth percentage', () => {
      const forecasts = createMockForecasts([100000, 150000])
      const summary = generateForecastSummary(forecasts)

      // Growth = ((150000 - 100000) / 100000) * 100 = 50%
      expect(summary.sims.growth).toBe(50)
    })

    it('should handle empty array', () => {
      const summary = generateForecastSummary([])

      expect(summary.totalPeriods).toBe(0)
      expect(summary.sims.min).toBe(0)
      expect(summary.sims.max).toBe(0)
    })

    it('should calculate total data volume', () => {
      const forecasts = createMockForecasts([100000, 100000, 100000])
      const summary = generateForecastSummary(forecasts)

      // Total = 3 * 100000 * 1.9 = 570000
      expect(summary.dataVolume.total).toBe(570000)
    })
  })
})
