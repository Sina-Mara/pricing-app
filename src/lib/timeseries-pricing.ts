/**
 * Time-Series Pricing Engine
 *
 * Handles pricing calculations for time-series forecasts with two modes:
 * 1. Pay-per-use: Monthly pricing with 1-month term
 * 2. Fixed commitment: Committed quantities with volume + term discounts
 */

import type {
  ParsedTimeseriesData,
  TimeseriesPeriodPricing,
  TimeseriesPayPerUsePricing,
  TimeseriesFixedCommitmentPricing,
  TimeseriesPricingComparison,
  CommitmentStrategy,
  ForecastSkuMapping,
} from '@/types/database'

// Default configuration values (same as ForecastEvaluator)
export const DEFAULT_FORECAST_CONFIG = {
  takeRatePcsUdr: 0.13,      // 13% - Active Users Concurrent / Total SIMs
  takeRateScsPcs: 1.0,       // 100% - Active Users Concurrent w/ Data Traffic / Active Users Concurrent
  takeRateCcsUdr: 0.9,       // 90% - Active Users Total / Total SIMs
  gbitPerGb: 8,              // Conversion factor
  daysPerMonth: 30,          // Days in month for throughput calculation
  busyHours: 8,              // Busy hours per day
  peakAverageRatio: 3,       // Peak to average throughput ratio
}

export interface ForecastConfig {
  takeRatePcsUdr: number
  takeRateCcsUdr: number
  takeRateScsPcs: number
  peakAverageRatio: number
  busyHours: number
  daysPerMonth: number
  gbitPerGb: number
}

export interface PeriodForecastResult {
  periodIndex: number
  periodDate: Date
  periodLabel: string
  // Inputs
  totalSims: number
  gbPerSim: number
  // Calculated outputs
  udr: number
  pcs: number
  ccs: number
  scs: number
  cos: number
  peakThroughput: number
  avgThroughput: number
  dataVolumeGb: number
}

export interface PricingDependencies {
  // Function to get unit price for a SKU at a given quantity
  getUnitPrice: (skuCode: string, quantity: number, termMonths: number) => Promise<number>
  // Function to get term discount factor
  getTermFactor: (category: string, termMonths: number) => Promise<number>
  // Forecast SKU mappings
  skuMappings: ForecastSkuMapping[]
}

/**
 * Calculate forecast outputs for a single period
 */
export function calculatePeriodForecast(
  totalSims: number,
  gbPerSim: number,
  config: ForecastConfig
): Omit<PeriodForecastResult, 'periodIndex' | 'periodDate' | 'periodLabel'> {
  // UDR = Total SIMs
  const udr = totalSims

  // PCS = Total SIMs × Take Rate (PCS/UDR)
  const pcs = Math.ceil(totalSims * config.takeRatePcsUdr)

  // CCS = Total SIMs × Take Rate (CCS/UDR)
  const ccs = Math.ceil(totalSims * config.takeRateCcsUdr)

  // SCS = PCS × Take Rate (SCS/PCS)
  const scs = Math.ceil(pcs * config.takeRateScsPcs)

  // CoS = Concurrent Sessions (same as SCS for gateway)
  const cos = scs

  // Data Volume = Total SIMs × GB/SIM
  const dataVolumeGb = totalSims * gbPerSim

  // Throughput Average = DataVolume × 8 / (30 × 8 × 3600) in Gbit/s
  const avgThroughput = (dataVolumeGb * config.gbitPerGb) /
    (config.daysPerMonth * config.busyHours * 3600)

  // Throughput Peak = Average × Peak/Average Ratio
  const peakThroughput = avgThroughput * config.peakAverageRatio

  return {
    totalSims,
    gbPerSim,
    udr,
    pcs,
    ccs,
    scs,
    cos,
    peakThroughput,
    avgThroughput,
    dataVolumeGb,
  }
}

/**
 * Calculate forecast outputs for all periods in the time-series
 */
export function calculateAllPeriodForecasts(
  data: ParsedTimeseriesData,
  config: ForecastConfig = DEFAULT_FORECAST_CONFIG
): PeriodForecastResult[] {
  const results: PeriodForecastResult[] = []

  // Get Total SIMs and GB per SIM KPIs
  const simsKpi = data.kpis.find(k => k.name === 'Total SIMs')
  const gbKpi = data.kpis.find(k => k.name === 'GB per SIM')

  if (!simsKpi) {
    throw new Error('Total SIMs KPI not found in data')
  }

  for (let i = 0; i < data.periods.length; i++) {
    const period = data.periods[i]
    const totalSims = simsKpi.values[i] ?? 0
    const gbPerSim = gbKpi?.values[i] ?? 1.9 // Default to 1.9 if not provided

    if (totalSims <= 0) {
      continue // Skip periods with no SIM data
    }

    const forecast = calculatePeriodForecast(totalSims, gbPerSim, config)

    results.push({
      periodIndex: i + 1,
      periodDate: period.date,
      periodLabel: period.label,
      ...forecast,
    })
  }

  return results
}

/**
 * Calculate percentile value from an array of numbers
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]

  const sorted = [...values].sort((a, b) => a - b)
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) {
    return sorted[lower]
  }

  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

/**
 * Calculate committed quantities based on strategy
 */
export function calculateCommittedQuantities(
  periodForecasts: PeriodForecastResult[],
  strategy: CommitmentStrategy,
  customPercentile?: number
): {
  udr: number
  pcs: number
  ccs: number
  scs: number
  cos: number
  peakThroughput: number
} {
  if (periodForecasts.length === 0) {
    return {
      udr: 0, pcs: 0, ccs: 0, scs: 0, cos: 0, peakThroughput: 0
    }
  }

  const udrValues = periodForecasts.map(p => p.udr)
  const pcsValues = periodForecasts.map(p => p.pcs)
  const ccsValues = periodForecasts.map(p => p.ccs)
  const scsValues = periodForecasts.map(p => p.scs)
  const cosValues = periodForecasts.map(p => p.cos)
  const throughputValues = periodForecasts.map(p => p.peakThroughput)

  switch (strategy) {
    case 'peak':
      return {
        udr: Math.max(...udrValues),
        pcs: Math.max(...pcsValues),
        ccs: Math.max(...ccsValues),
        scs: Math.max(...scsValues),
        cos: Math.max(...cosValues),
        peakThroughput: Math.max(...throughputValues),
      }

    case 'average':
      return {
        udr: Math.ceil(udrValues.reduce((a, b) => a + b, 0) / udrValues.length),
        pcs: Math.ceil(pcsValues.reduce((a, b) => a + b, 0) / pcsValues.length),
        ccs: Math.ceil(ccsValues.reduce((a, b) => a + b, 0) / ccsValues.length),
        scs: Math.ceil(scsValues.reduce((a, b) => a + b, 0) / scsValues.length),
        cos: Math.ceil(cosValues.reduce((a, b) => a + b, 0) / cosValues.length),
        peakThroughput: throughputValues.reduce((a, b) => a + b, 0) / throughputValues.length,
      }

    case 'p90':
      return {
        udr: Math.ceil(percentile(udrValues, 90)),
        pcs: Math.ceil(percentile(pcsValues, 90)),
        ccs: Math.ceil(percentile(ccsValues, 90)),
        scs: Math.ceil(percentile(scsValues, 90)),
        cos: Math.ceil(percentile(cosValues, 90)),
        peakThroughput: percentile(throughputValues, 90),
      }

    case 'p95':
      return {
        udr: Math.ceil(percentile(udrValues, 95)),
        pcs: Math.ceil(percentile(pcsValues, 95)),
        ccs: Math.ceil(percentile(ccsValues, 95)),
        scs: Math.ceil(percentile(scsValues, 95)),
        cos: Math.ceil(percentile(cosValues, 95)),
        peakThroughput: percentile(throughputValues, 95),
      }

    case 'custom':
      const p = customPercentile ?? 90
      return {
        udr: Math.ceil(percentile(udrValues, p)),
        pcs: Math.ceil(percentile(pcsValues, p)),
        ccs: Math.ceil(percentile(ccsValues, p)),
        scs: Math.ceil(percentile(scsValues, p)),
        cos: Math.ceil(percentile(cosValues, p)),
        peakThroughput: percentile(throughputValues, p),
      }

    default:
      return {
        udr: Math.max(...udrValues),
        pcs: Math.max(...pcsValues),
        ccs: Math.max(...ccsValues),
        scs: Math.max(...scsValues),
        cos: Math.max(...cosValues),
        peakThroughput: Math.max(...throughputValues),
      }
  }
}

/**
 * Map KPI type to SKU code based on mappings
 */
export function getSkuForKpi(
  kpiType: string,
  mappings: ForecastSkuMapping[]
): ForecastSkuMapping | undefined {
  return mappings.find(m => m.kpi_type === kpiType && m.is_active)
}

/**
 * Calculate pay-per-use pricing for time-series data
 * Each month is priced independently with 1-month term
 */
export async function calculatePayPerUsePricing(
  periodForecasts: PeriodForecastResult[],
  deps: PricingDependencies
): Promise<TimeseriesPayPerUsePricing> {
  const periods: TimeseriesPeriodPricing[] = []
  const totalMonthly: number[] = []

  for (const forecast of periodForecasts) {
    const breakdown: TimeseriesPeriodPricing['breakdown'] = []
    let periodTotal = 0

    // Price each KPI based on SKU mappings
    const kpiValues: Record<string, number> = {
      udr: forecast.udr,
      pcs: forecast.pcs,
      ccs: forecast.ccs,
      scs: forecast.scs,
      cos: forecast.cos,
      peak_throughput: forecast.peakThroughput,
    }

    for (const mapping of deps.skuMappings) {
      if (!mapping.is_active || !mapping.sku) continue

      const kpiValue = kpiValues[mapping.kpi_type]
      if (kpiValue === undefined || kpiValue <= 0) continue

      const quantity = Math.ceil(kpiValue * mapping.multiplier)
      const unitPrice = await deps.getUnitPrice(mapping.sku.code, quantity, 1)
      const total = quantity * unitPrice

      breakdown.push({
        skuCode: mapping.sku.code,
        skuDescription: mapping.sku.description,
        quantity,
        unitPrice,
        total,
      })

      periodTotal += total
    }

    periods.push({
      periodIndex: forecast.periodIndex,
      periodDate: forecast.periodDate.toISOString(),
      periodLabel: forecast.periodLabel,
      totalSims: forecast.totalSims,
      gbPerSim: forecast.gbPerSim,
      udr: forecast.udr,
      pcs: forecast.pcs,
      ccs: forecast.ccs,
      scs: forecast.scs,
      cos: forecast.cos,
      peakThroughput: forecast.peakThroughput,
      avgThroughput: forecast.avgThroughput,
      dataVolumeGb: forecast.dataVolumeGb,
      monthlyTotal: periodTotal,
      breakdown,
    })

    totalMonthly.push(periodTotal)
  }

  const grandTotal = totalMonthly.reduce((a, b) => a + b, 0)
  const averageMonthly = totalMonthly.length > 0 ? grandTotal / totalMonthly.length : 0

  return {
    mode: 'pay_per_use',
    termMonths: 1,
    periods,
    totalMonthly,
    grandTotal,
    averageMonthly,
  }
}

/**
 * Calculate fixed commitment pricing for time-series data
 * Single committed quantity with term discount
 */
export async function calculateFixedCommitmentPricing(
  periodForecasts: PeriodForecastResult[],
  strategy: CommitmentStrategy,
  termMonths: number,
  deps: PricingDependencies,
  customPercentile?: number
): Promise<TimeseriesFixedCommitmentPricing> {
  const committed = calculateCommittedQuantities(periodForecasts, strategy, customPercentile)

  const breakdown: TimeseriesFixedCommitmentPricing['breakdown'] = []
  let monthlyTotal = 0
  let totalVolumeDiscount = 0

  // Price each KPI based on SKU mappings
  const kpiValues: Record<string, number> = {
    udr: committed.udr,
    pcs: committed.pcs,
    ccs: committed.ccs,
    scs: committed.scs,
    cos: committed.cos,
    peak_throughput: committed.peakThroughput,
  }

  for (const mapping of deps.skuMappings) {
    if (!mapping.is_active || !mapping.sku) continue

    const kpiValue = kpiValues[mapping.kpi_type]
    if (kpiValue === undefined || kpiValue <= 0) continue

    const quantity = Math.ceil(kpiValue * mapping.multiplier)
    const unitPrice = await deps.getUnitPrice(mapping.sku.code, quantity, termMonths)

    // Get base price (1-month) for discount calculation
    const basePrice = await deps.getUnitPrice(mapping.sku.code, quantity, 1)
    const volumeDiscountPct = basePrice > 0 ? 1 - (unitPrice / basePrice) : 0

    const total = quantity * unitPrice

    breakdown.push({
      skuCode: mapping.sku.code,
      skuDescription: mapping.sku.description,
      quantity,
      unitPrice,
      total,
    })

    monthlyTotal += total
    totalVolumeDiscount += volumeDiscountPct * total
  }

  const avgVolumeDiscount = monthlyTotal > 0 ? totalVolumeDiscount / monthlyTotal : 0
  const termFactor = await deps.getTermFactor('default', termMonths)
  const avgTermDiscount = 1 - termFactor

  return {
    mode: 'fixed_commitment',
    strategy,
    termMonths,
    committedQuantities: committed,
    monthlyTotal,
    termDiscount: avgTermDiscount,
    volumeDiscount: avgVolumeDiscount,
    breakdown,
  }
}

/**
 * Compare pay-per-use vs fixed commitment pricing
 */
export async function comparePricingModes(
  periodForecasts: PeriodForecastResult[],
  strategy: CommitmentStrategy,
  termMonths: number,
  deps: PricingDependencies,
  customPercentile?: number
): Promise<TimeseriesPricingComparison> {
  const payPerUse = await calculatePayPerUsePricing(periodForecasts, deps)
  const fixedCommitment = await calculateFixedCommitmentPricing(
    periodForecasts,
    strategy,
    termMonths,
    deps,
    customPercentile
  )

  // Calculate total cost for comparison period
  const payPerUseTotal = payPerUse.grandTotal
  const fixedTotal = fixedCommitment.monthlyTotal * periodForecasts.length

  const savings = payPerUseTotal - fixedTotal
  const savingsPercent = payPerUseTotal > 0 ? (savings / payPerUseTotal) * 100 : 0

  return {
    payPerUse,
    fixedCommitment,
    savings,
    savingsPercent,
  }
}

/**
 * Format period date for display
 */
export function formatPeriodDate(date: Date | string, granularity: 'monthly' | 'yearly'): string {
  const d = typeof date === 'string' ? new Date(date) : date

  if (granularity === 'yearly') {
    return d.getFullYear().toString()
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Result of GB per SIM calculation
 */
export interface GbPerSimResult {
  /** GB per SIM on a yearly basis */
  yearly: number
  /** GB per SIM on a monthly basis (yearly / 12) */
  monthly: number
}

/**
 * Calculate GB per SIM from total data usage and total SIM count.
 *
 * This function derives the GB per SIM metric from aggregate data:
 * - GB per SIM (yearly) = Total Data Usage (GB) / Total SIMs
 * - GB per SIM (monthly) = GB per SIM (yearly) / 12
 *
 * @example
 * // 1,900,000 GB / 100,000 SIMs = 19 GB/SIM/year, ~1.58 GB/SIM/month
 * const result = calculateGbPerSim(1900000, 100000)
 * // result = { yearly: 19, monthly: 1.5833... }
 *
 * @param totalDataUsageGb - Total data usage in GB (yearly total)
 * @param totalSims - Total number of SIMs
 * @returns Object containing yearly and monthly GB per SIM values, or null for invalid inputs
 */
export function calculateGbPerSim(
  totalDataUsageGb: number,
  totalSims: number
): GbPerSimResult | null {
  // Handle edge cases: invalid inputs
  if (
    totalSims === null ||
    totalSims === undefined ||
    totalDataUsageGb === null ||
    totalDataUsageGb === undefined ||
    !Number.isFinite(totalSims) ||
    !Number.isFinite(totalDataUsageGb)
  ) {
    return null
  }

  // Handle division by zero
  if (totalSims <= 0) {
    return null
  }

  // Handle negative data usage (invalid)
  if (totalDataUsageGb < 0) {
    return null
  }

  const gbPerSimYearly = totalDataUsageGb / totalSims
  const gbPerSimMonthly = gbPerSimYearly / 12

  return {
    yearly: gbPerSimYearly,
    monthly: gbPerSimMonthly,
  }
}

/**
 * Calculate GB per SIM and return only the yearly value.
 *
 * Convenience function that returns just the yearly GB per SIM value.
 * Returns 0 for invalid inputs instead of null (useful for calculations).
 *
 * @param totalDataUsageGb - Total data usage in GB (yearly total)
 * @param totalSims - Total number of SIMs
 * @returns GB per SIM (yearly), or 0 for invalid inputs
 */
export function calculateGbPerSimYearly(
  totalDataUsageGb: number,
  totalSims: number
): number {
  const result = calculateGbPerSim(totalDataUsageGb, totalSims)
  return result?.yearly ?? 0
}

/**
 * Calculate GB per SIM and return only the monthly value.
 *
 * Convenience function that returns just the monthly GB per SIM value.
 * Returns 0 for invalid inputs instead of null (useful for calculations).
 *
 * @param totalDataUsageGb - Total data usage in GB (yearly total)
 * @param totalSims - Total number of SIMs
 * @returns GB per SIM (monthly), or 0 for invalid inputs
 */
export function calculateGbPerSimMonthly(
  totalDataUsageGb: number,
  totalSims: number
): number {
  const result = calculateGbPerSim(totalDataUsageGb, totalSims)
  return result?.monthly ?? 0
}

// =============================================================================
// Yearly to Monthly Interpolation Types
// =============================================================================

/**
 * Represents a single yearly data point for forecast interpolation
 */
export interface YearlyDataPoint {
  /** The year (e.g., 2026) */
  year: number
  /** Total number of SIMs at end of year */
  totalSims: number
  /** Total data usage in GB at end of year */
  totalDataUsageGb: number
}

/**
 * Represents a single monthly data point after interpolation
 */
export interface MonthlyDataPoint {
  /** The year (e.g., 2026) */
  year: number
  /** The month (1-12) */
  month: number
  /** Full date object for this month (first day of month) */
  date: Date
  /** Interpolated total SIMs for this month */
  totalSims: number
  /** Interpolated total data usage in GB for this month */
  totalDataUsageGb: number
  /** Derived GB per SIM (totalDataUsageGb / totalSims) */
  gbPerSim: number
}

// =============================================================================
// Yearly to Monthly Interpolation Functions
// =============================================================================

/**
 * Expands yearly forecast data to monthly granularity using linear interpolation.
 *
 * The interpolation logic works as follows:
 * - Given year-end values, we linearly interpolate between consecutive years
 * - For a transition from Year N to Year N+1:
 *   - Monthly increment = (Year N+1 value - Year N value) / 12
 *   - Month M of Year N+1 = Year N value + (M * increment)
 *   - December (M=12) equals the Year N+1 end-of-year value
 *
 * @example
 * // Year 2026 = 100,000 SIMs, Year 2027 = 150,000 SIMs
 * // Monthly increment = (150,000 - 100,000) / 12 = 4,167 SIMs/month
 * // Jan 2027: 100,000 + (1 * 4,167) = 104,167
 * // Feb 2027: 100,000 + (2 * 4,167) = 108,334
 * // ...
 * // Dec 2027: 150,000 (end-of-year value)
 *
 * const yearlyData = [
 *   { year: 2026, totalSims: 100000, totalDataUsageGb: 190000 },
 *   { year: 2027, totalSims: 150000, totalDataUsageGb: 285000 },
 * ]
 * const monthlyData = interpolateYearlyToMonthly(yearlyData)
 *
 * Edge cases handled:
 * - Single year: Distributes evenly across 12 months (constant value)
 * - First year: Uses the year's value as baseline for all 12 months of that year
 * - Empty input: Returns empty array
 *
 * @param yearlyData - Array of yearly data points, should be sorted by year
 * @returns Array of monthly data points with interpolated values
 */
export function interpolateYearlyToMonthly(
  yearlyData: YearlyDataPoint[]
): MonthlyDataPoint[] {
  if (yearlyData.length === 0) {
    return []
  }

  // Sort by year to ensure correct order
  const sortedData = [...yearlyData].sort((a, b) => a.year - b.year)
  const monthlyData: MonthlyDataPoint[] = []

  // Handle single year case - no interpolation needed, constant values for all 12 months
  if (sortedData.length === 1) {
    const yearData = sortedData[0]
    for (let month = 1; month <= 12; month++) {
      const gbPerSim = yearData.totalSims > 0
        ? yearData.totalDataUsageGb / yearData.totalSims
        : 0

      monthlyData.push({
        year: yearData.year,
        month,
        date: new Date(yearData.year, month - 1, 1),
        totalSims: yearData.totalSims,
        totalDataUsageGb: yearData.totalDataUsageGb,
        gbPerSim,
      })
    }
    return monthlyData
  }

  // Handle first year - use first year's values as baseline for all 12 months
  const firstYear = sortedData[0]
  for (let month = 1; month <= 12; month++) {
    const gbPerSim = firstYear.totalSims > 0
      ? firstYear.totalDataUsageGb / firstYear.totalSims
      : 0

    monthlyData.push({
      year: firstYear.year,
      month,
      date: new Date(firstYear.year, month - 1, 1),
      totalSims: firstYear.totalSims,
      totalDataUsageGb: firstYear.totalDataUsageGb,
      gbPerSim,
    })
  }

  // Interpolate between consecutive years
  for (let i = 1; i < sortedData.length; i++) {
    const prevYear = sortedData[i - 1]
    const currYear = sortedData[i]

    // Calculate monthly increments for linear interpolation
    const simsIncrement = (currYear.totalSims - prevYear.totalSims) / 12
    const dataIncrement = (currYear.totalDataUsageGb - prevYear.totalDataUsageGb) / 12

    // Generate 12 months for this year
    for (let month = 1; month <= 12; month++) {
      // Linear interpolation: previous year end value + (month * increment)
      const totalSims = Math.round(prevYear.totalSims + (month * simsIncrement))
      const totalDataUsageGb = prevYear.totalDataUsageGb + (month * dataIncrement)
      const gbPerSim = totalSims > 0 ? totalDataUsageGb / totalSims : 0

      monthlyData.push({
        year: currYear.year,
        month,
        date: new Date(currYear.year, month - 1, 1),
        totalSims,
        totalDataUsageGb,
        gbPerSim,
      })
    }
  }

  return monthlyData
}

/**
 * Converts monthly interpolated data to the ParsedTimeseriesData format
 * used by the pricing engine.
 *
 * This is a convenience function to bridge the interpolation output
 * with the existing pricing calculation functions.
 *
 * @param monthlyData - Array of interpolated monthly data points
 * @returns ParsedTimeseriesData compatible object with periods and KPIs
 */
export function monthlyDataToParsedTimeseries(
  monthlyData: MonthlyDataPoint[]
): {
  periods: Array<{ date: Date; label: string }>
  kpis: Array<{ name: string; values: number[] }>
} {
  const periods = monthlyData.map(m => ({
    date: m.date,
    label: formatPeriodDate(m.date, 'monthly'),
  }))

  const kpis = [
    {
      name: 'Total SIMs',
      values: monthlyData.map(m => m.totalSims),
    },
    {
      name: 'GB per SIM',
      values: monthlyData.map(m => m.gbPerSim),
    },
    {
      name: 'Total Data Usage GB',
      values: monthlyData.map(m => m.totalDataUsageGb),
    },
  ]

  return { periods, kpis }
}

// =============================================================================
// Summary Statistics
// =============================================================================

/**
 * Generate summary statistics for a time-series forecast
 */
export function generateForecastSummary(periodForecasts: PeriodForecastResult[]): {
  totalPeriods: number
  startDate: Date
  endDate: Date
  sims: { min: number; max: number; avg: number; growth: number }
  dataVolume: { min: number; max: number; total: number }
} {
  if (periodForecasts.length === 0) {
    const now = new Date()
    return {
      totalPeriods: 0,
      startDate: now,
      endDate: now,
      sims: { min: 0, max: 0, avg: 0, growth: 0 },
      dataVolume: { min: 0, max: 0, total: 0 },
    }
  }

  const simValues = periodForecasts.map(p => p.totalSims)
  const dataValues = periodForecasts.map(p => p.dataVolumeGb)

  const firstSims = simValues[0]
  const lastSims = simValues[simValues.length - 1]
  const growth = firstSims > 0 ? ((lastSims - firstSims) / firstSims) * 100 : 0

  return {
    totalPeriods: periodForecasts.length,
    startDate: periodForecasts[0].periodDate,
    endDate: periodForecasts[periodForecasts.length - 1].periodDate,
    sims: {
      min: Math.min(...simValues),
      max: Math.max(...simValues),
      avg: Math.ceil(simValues.reduce((a, b) => a + b, 0) / simValues.length),
      growth,
    },
    dataVolume: {
      min: Math.min(...dataValues),
      max: Math.max(...dataValues),
      total: dataValues.reduce((a, b) => a + b, 0),
    },
  }
}
