/**
 * Scenario Generator
 *
 * Utility functions for generating forecast scenarios from yearly forecast data.
 * Supports two modes:
 * 1. Per-Year: Creates one scenario for each year in the forecast
 * 2. Consolidated: Creates one scenario using aggregated values (peak/average/custom)
 *
 * Consolidation Strategies:
 * - Peak: Uses the year with maximum SIMs and its corresponding GB/SIM
 *         Rationale: Size for peak capacity
 * - Average: Uses average SIMs and average GB/SIM across all years
 *            Rationale: Size for typical usage
 * - Custom: Uses user-provided values
 *           Rationale: User knows best based on business requirements
 *
 * Example Consolidation:
 *   Year 2026: 100,000 SIMs, 19 GB/SIM/year (1.58 monthly)
 *   Year 2027: 150,000 SIMs, 20 GB/SIM/year (1.67 monthly)
 *   Year 2028: 200,000 SIMs, 22.5 GB/SIM/year (1.875 monthly)
 *
 *   Peak: 200,000 SIMs, 1.875 GB/SIM/month (from 2028)
 *   Average: 150,000 SIMs, 1.71 GB/SIM/month
 *   Custom: User-defined values
 */

import { supabase } from '@/lib/supabase'
import {
  calculatePeriodForecast,
  DEFAULT_FORECAST_CONFIG,
  type ForecastConfig,
} from '@/lib/timeseries-pricing'
import type { YearlyForecastRow } from '@/components/YearlyForecastInput'
import type { CreateScenarioOptions, ConsolidationStrategy } from '@/components/CreateScenarioModal'
import type { ForecastScenario } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

/**
 * Input for generating a consolidated scenario
 */
export interface ConsolidatedScenarioInput {
  strategy: ConsolidationStrategy
  customTotalSims?: number
  customGbPerSim?: number
}

/**
 * Input data for per-year scenario generation
 */
export interface PerYearScenarioInput {
  year: number
  totalSims: number
  totalDataUsageGb: number
  gbPerSimMonthly: number // derived: (totalDataUsageGb / totalSims) / 12
}

/**
 * Result of aggregating yearly data
 */
export interface AggregatedValues {
  totalSims: number
  gbPerSimMonthly: number
  sourceYear?: number
  strategy: ConsolidationStrategy
}

/**
 * Generated scenario ready for database insertion
 */
export interface GeneratedScenario {
  name: string
  description?: string
  customer_id?: string | null
  total_sims: number
  gb_per_sim: number // monthly
  // Configuration (using defaults)
  take_rate_pcs_udr: number
  take_rate_ccs_udr: number
  take_rate_scs_pcs: number
  peak_average_ratio: number
  busy_hours: number
  days_per_month: number
  // Calculated outputs
  output_udr: number
  output_pcs: number
  output_ccs: number
  output_scs: number
  output_cos: number
  output_peak_throughput: number
  output_avg_throughput: number
  output_data_volume_gb: number
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate monthly GB per SIM from yearly totals
 */
function calculateMonthlyGbPerSim(totalDataUsageGb: number, totalSims: number): number {
  if (totalSims <= 0) return 0
  const yearlyGbPerSim = totalDataUsageGb / totalSims
  return yearlyGbPerSim / 12
}

/**
 * Convert YearlyForecastRow to PerYearScenarioInput
 */
function rowToInput(row: YearlyForecastRow): PerYearScenarioInput {
  return {
    year: row.year,
    totalSims: row.endOfYearSims,
    totalDataUsageGb: row.totalDataUsageGB,
    gbPerSimMonthly: calculateMonthlyGbPerSim(row.totalDataUsageGB, row.endOfYearSims),
  }
}

/**
 * Calculate forecast outputs for given inputs
 */
function calculateOutputs(
  totalSims: number,
  gbPerSimMonthly: number,
  config: ForecastConfig = DEFAULT_FORECAST_CONFIG
): {
  udr: number
  pcs: number
  ccs: number
  scs: number
  cos: number
  peakThroughput: number
  avgThroughput: number
  dataVolumeGb: number
} {
  const result = calculatePeriodForecast(totalSims, gbPerSimMonthly, config)
  return {
    udr: result.udr,
    pcs: result.pcs,
    ccs: result.ccs,
    scs: result.scs,
    cos: result.cos,
    peakThroughput: result.peakThroughput,
    avgThroughput: result.avgThroughput,
    dataVolumeGb: result.dataVolumeGb,
  }
}

// =============================================================================
// Aggregation Functions
// =============================================================================

/**
 * Calculate yearly GB per SIM from totals
 */
export function calculateYearlyGbPerSim(totalDataUsageGb: number, totalSims: number): number {
  if (totalSims <= 0) return 0
  return totalDataUsageGb / totalSims
}

/**
 * Apply peak aggregation strategy
 *
 * Finds the year with maximum SIMs and uses that year's values.
 * Rationale: Size for peak capacity
 *
 * @param yearlyData - Array of yearly forecast rows
 * @returns Aggregated values using peak strategy
 */
export function aggregatePeak(yearlyData: YearlyForecastRow[]): AggregatedValues {
  if (yearlyData.length === 0) {
    return {
      totalSims: 0,
      gbPerSimMonthly: 0,
      strategy: 'peak',
    }
  }

  // Find the year with maximum SIMs
  const peakRow = yearlyData.reduce((max, row) =>
    row.endOfYearSims > max.endOfYearSims ? row : max
  )

  return {
    totalSims: peakRow.endOfYearSims,
    gbPerSimMonthly: calculateMonthlyGbPerSim(peakRow.totalDataUsageGB, peakRow.endOfYearSims),
    sourceYear: peakRow.year,
    strategy: 'peak',
  }
}

/**
 * Apply average aggregation strategy
 *
 * Calculates the average SIMs and average GB/SIM across all years.
 * Rationale: Size for typical usage
 *
 * @param yearlyData - Array of yearly forecast rows
 * @returns Aggregated values using average strategy
 */
export function aggregateAverage(yearlyData: YearlyForecastRow[]): AggregatedValues {
  if (yearlyData.length === 0) {
    return {
      totalSims: 0,
      gbPerSimMonthly: 0,
      strategy: 'average',
    }
  }

  // Calculate average SIMs
  const totalSims = yearlyData.reduce((sum, row) => sum + row.endOfYearSims, 0)
  const avgSims = Math.ceil(totalSims / yearlyData.length)

  // Calculate average GB/SIM (monthly)
  const gbPerSimValues = yearlyData.map(row =>
    calculateMonthlyGbPerSim(row.totalDataUsageGB, row.endOfYearSims)
  )
  const avgGbPerSimMonthly = gbPerSimValues.reduce((sum, v) => sum + v, 0) / gbPerSimValues.length

  return {
    totalSims: avgSims,
    gbPerSimMonthly: avgGbPerSimMonthly,
    strategy: 'average',
  }
}

/**
 * Apply custom aggregation strategy
 *
 * Uses user-provided values directly.
 * Rationale: User knows best based on business requirements
 *
 * @param customTotalSims - User-provided total SIMs
 * @param customGbPerSim - User-provided GB/SIM (monthly)
 * @returns Aggregated values using custom strategy
 */
export function aggregateCustom(
  customTotalSims: number,
  customGbPerSim: number
): AggregatedValues {
  return {
    totalSims: customTotalSims,
    gbPerSimMonthly: customGbPerSim,
    strategy: 'custom',
  }
}

/**
 * Aggregate yearly data based on the specified strategy
 *
 * @param yearlyData - Array of yearly forecast rows
 * @param input - Consolidation input with strategy and optional custom values
 * @returns Aggregated values
 */
export function aggregateYearlyData(
  yearlyData: YearlyForecastRow[],
  input: ConsolidatedScenarioInput
): AggregatedValues {
  switch (input.strategy) {
    case 'peak':
      return aggregatePeak(yearlyData)
    case 'average':
      return aggregateAverage(yearlyData)
    case 'custom':
      return aggregateCustom(
        input.customTotalSims ?? 0,
        input.customGbPerSim ?? 0
      )
    default:
      // Default to peak if unknown strategy
      return aggregatePeak(yearlyData)
  }
}

/**
 * Calculate consolidated preview values for UI display
 *
 * @param yearlyData - Array of yearly forecast rows
 * @returns Object with peak and average values for preview
 */
export function calculateConsolidatedPreview(yearlyData: YearlyForecastRow[]): {
  peak: { totalSims: number; gbPerSimMonthly: number; sourceYear: number | undefined }
  average: { totalSims: number; gbPerSimMonthly: number }
} {
  const validData = yearlyData.filter(row => row.endOfYearSims > 0)

  if (validData.length === 0) {
    return {
      peak: { totalSims: 0, gbPerSimMonthly: 0, sourceYear: undefined },
      average: { totalSims: 0, gbPerSimMonthly: 0 },
    }
  }

  const peak = aggregatePeak(validData)
  const average = aggregateAverage(validData)

  return {
    peak: {
      totalSims: peak.totalSims,
      gbPerSimMonthly: peak.gbPerSimMonthly,
      sourceYear: peak.sourceYear,
    },
    average: {
      totalSims: average.totalSims,
      gbPerSimMonthly: average.gbPerSimMonthly,
    },
  }
}

/**
 * Get a human-readable description of a consolidation strategy
 */
export function getStrategyDescription(strategy: ConsolidationStrategy): string {
  switch (strategy) {
    case 'peak':
      return 'Uses the year with maximum SIMs and its corresponding GB/SIM value. Best for sizing peak capacity.'
    case 'average':
      return 'Uses average SIMs and average GB/SIM across all years. Best for typical usage sizing.'
    case 'custom':
      return 'Uses custom user-defined values. Best when business requirements dictate specific numbers.'
    default:
      return 'Unknown strategy'
  }
}

/**
 * Format aggregated values for display
 */
export function formatAggregatedValues(values: AggregatedValues): string {
  const simsFormatted = values.totalSims.toLocaleString()
  const gbFormatted = values.gbPerSimMonthly.toFixed(2)
  return `${simsFormatted} SIMs, ${gbFormatted} GB/SIM/month`
}

// =============================================================================
// Scenario Generation Functions
// =============================================================================

/**
 * Generate one scenario for each year in the yearly data
 *
 * @param yearlyData - Array of yearly forecast rows
 * @param namePrefix - Prefix for scenario names (year will be appended)
 * @param customerId - Optional customer ID to associate with scenarios
 * @param config - Optional forecast configuration (uses defaults if not provided)
 * @returns Array of generated scenarios ready for database insertion
 */
export function generatePerYearScenarios(
  yearlyData: YearlyForecastRow[],
  namePrefix: string,
  customerId?: string | null,
  config: ForecastConfig = DEFAULT_FORECAST_CONFIG
): GeneratedScenario[] {
  // Sort by year
  const sortedData = [...yearlyData].sort((a, b) => a.year - b.year)

  return sortedData
    .filter((row) => row.endOfYearSims > 0) // Skip rows with no SIMs
    .map((row) => {
      const input = rowToInput(row)
      const outputs = calculateOutputs(input.totalSims, input.gbPerSimMonthly, config)

      return {
        name: `${namePrefix} - ${row.year}`,
        description: `Generated from yearly forecast for year ${row.year}`,
        customer_id: customerId,
        total_sims: input.totalSims,
        gb_per_sim: input.gbPerSimMonthly,
        take_rate_pcs_udr: config.takeRatePcsUdr,
        take_rate_ccs_udr: config.takeRateCcsUdr,
        take_rate_scs_pcs: config.takeRateScsPcs,
        peak_average_ratio: config.peakAverageRatio,
        busy_hours: config.busyHours,
        days_per_month: config.daysPerMonth,
        output_udr: outputs.udr,
        output_pcs: outputs.pcs,
        output_ccs: outputs.ccs,
        output_scs: outputs.scs,
        output_cos: outputs.cos,
        output_peak_throughput: outputs.peakThroughput,
        output_avg_throughput: outputs.avgThroughput,
        output_data_volume_gb: outputs.dataVolumeGb,
      }
    })
}

/**
 * Generate a single consolidated scenario from yearly data
 *
 * Creates a single scenario by aggregating multiple years of data using
 * the specified strategy (peak, average, or custom).
 *
 * Example:
 *   Year 2026: 100,000 SIMs, 19 GB/SIM/year (1.58 monthly)
 *   Year 2027: 150,000 SIMs, 20 GB/SIM/year (1.67 monthly)
 *   Year 2028: 200,000 SIMs, 22.5 GB/SIM/year (1.875 monthly)
 *
 *   Peak: 200,000 SIMs, 1.875 GB/SIM/month (from 2028)
 *   Average: 150,000 SIMs, 1.71 GB/SIM/month
 *   Custom: User-defined values
 *
 * @param yearlyData - Array of yearly forecast rows
 * @param name - Name for the scenario
 * @param strategy - Consolidation strategy (peak, average, custom)
 * @param customerId - Optional customer ID
 * @param customValues - Custom SIMs and GB/SIM for 'custom' strategy
 * @param config - Optional forecast configuration
 * @returns Single generated scenario
 */
export function generateConsolidatedScenario(
  yearlyData: YearlyForecastRow[],
  name: string,
  strategy: ConsolidationStrategy,
  customerId?: string | null,
  customValues?: { totalSims: number; gbPerSim: number },
  config: ForecastConfig = DEFAULT_FORECAST_CONFIG
): GeneratedScenario {
  const validData = yearlyData.filter((row) => row.endOfYearSims > 0)

  if (validData.length === 0) {
    throw new Error('No valid yearly data to consolidate')
  }

  let totalSims: number
  let gbPerSimMonthly: number
  let sourceYear: number | undefined

  if (strategy === 'custom' && customValues) {
    totalSims = customValues.totalSims
    gbPerSimMonthly = customValues.gbPerSim // Already monthly
  } else if (strategy === 'peak') {
    // Use maximum SIMs and corresponding GB/SIM
    const peakRow = validData.reduce((max, row) =>
      row.endOfYearSims > max.endOfYearSims ? row : max
    )
    totalSims = peakRow.endOfYearSims
    gbPerSimMonthly = calculateMonthlyGbPerSim(peakRow.totalDataUsageGB, peakRow.endOfYearSims)
    sourceYear = peakRow.year
  } else {
    // Average strategy
    const avgSims = Math.ceil(
      validData.reduce((sum, row) => sum + row.endOfYearSims, 0) / validData.length
    )
    const avgGbPerSimMonthly =
      validData.reduce(
        (sum, row) => sum + calculateMonthlyGbPerSim(row.totalDataUsageGB, row.endOfYearSims),
        0
      ) / validData.length
    totalSims = avgSims
    gbPerSimMonthly = avgGbPerSimMonthly
  }

  // Build detailed description
  const sortedYears = [...validData].map(r => r.year).sort()
  const yearRange = sortedYears.length > 1
    ? `${sortedYears[0]}-${sortedYears[sortedYears.length - 1]}`
    : `${sortedYears[0]}`

  let description: string
  switch (strategy) {
    case 'peak':
      description = `Consolidated scenario (${yearRange}) using peak values from year ${sourceYear}. ` +
        `${totalSims.toLocaleString()} SIMs, ${gbPerSimMonthly.toFixed(2)} GB/SIM/month.`
      break
    case 'average':
      description = `Consolidated scenario (${yearRange}) using average values across ${validData.length} years. ` +
        `${totalSims.toLocaleString()} SIMs, ${gbPerSimMonthly.toFixed(2)} GB/SIM/month.`
      break
    case 'custom':
      description = `Consolidated scenario (${yearRange}) using custom values. ` +
        `${totalSims.toLocaleString()} SIMs, ${gbPerSimMonthly.toFixed(2)} GB/SIM/month.`
      break
    default:
      description = `Consolidated scenario (${yearRange}) using ${strategy} strategy.`
  }

  const outputs = calculateOutputs(totalSims, gbPerSimMonthly, config)

  return {
    name,
    description,
    customer_id: customerId,
    total_sims: totalSims,
    gb_per_sim: gbPerSimMonthly,
    take_rate_pcs_udr: config.takeRatePcsUdr,
    take_rate_ccs_udr: config.takeRateCcsUdr,
    take_rate_scs_pcs: config.takeRateScsPcs,
    peak_average_ratio: config.peakAverageRatio,
    busy_hours: config.busyHours,
    days_per_month: config.daysPerMonth,
    output_udr: outputs.udr,
    output_pcs: outputs.pcs,
    output_ccs: outputs.ccs,
    output_scs: outputs.scs,
    output_cos: outputs.cos,
    output_peak_throughput: outputs.peakThroughput,
    output_avg_throughput: outputs.avgThroughput,
    output_data_volume_gb: outputs.dataVolumeGb,
  }
}

/**
 * Generate a consolidated scenario using the ConsolidatedScenarioInput interface
 *
 * This is an alternative function signature that accepts a ConsolidatedScenarioInput
 * object for easier integration with UI components.
 *
 * @param yearlyData - Array of yearly forecast rows
 * @param name - Name for the scenario
 * @param input - Consolidation input with strategy and optional custom values
 * @param customerId - Optional customer ID
 * @param config - Optional forecast configuration
 * @returns Single generated scenario
 */
export function generateConsolidatedScenarioFromInput(
  yearlyData: YearlyForecastRow[],
  name: string,
  input: ConsolidatedScenarioInput,
  customerId?: string | null,
  config: ForecastConfig = DEFAULT_FORECAST_CONFIG
): GeneratedScenario {
  const customValues = input.strategy === 'custom' && input.customTotalSims !== undefined
    ? { totalSims: input.customTotalSims, gbPerSim: input.customGbPerSim ?? 0 }
    : undefined

  return generateConsolidatedScenario(
    yearlyData,
    name,
    input.strategy,
    customerId,
    customValues,
    config
  )
}

// =============================================================================
// Database Functions
// =============================================================================

/**
 * Save generated scenarios to the database
 *
 * @param scenarios - Array of generated scenarios
 * @param sourceTimeseriesId - Optional ID of the source timeseries forecast
 * @returns Array of created scenario IDs
 */
export async function saveScenarios(
  scenarios: GeneratedScenario[],
  _sourceTimeseriesId?: string
): Promise<string[]> {
  if (scenarios.length === 0) {
    return []
  }

  // Prepare data for insertion
  const insertData = scenarios.map((scenario) => ({
    customer_id: scenario.customer_id || null,
    name: scenario.name,
    description: scenario.description || null,
    total_sims: scenario.total_sims,
    gb_per_sim: scenario.gb_per_sim,
    take_rate_pcs_udr: scenario.take_rate_pcs_udr,
    take_rate_ccs_udr: scenario.take_rate_ccs_udr,
    take_rate_scs_pcs: scenario.take_rate_scs_pcs,
    peak_average_ratio: scenario.peak_average_ratio,
    busy_hours: scenario.busy_hours,
    days_per_month: scenario.days_per_month,
    output_udr: scenario.output_udr,
    output_pcs: scenario.output_pcs,
    output_ccs: scenario.output_ccs,
    output_scs: scenario.output_scs,
    output_cos: scenario.output_cos,
    output_peak_throughput: scenario.output_peak_throughput,
    output_avg_throughput: scenario.output_avg_throughput,
    output_data_volume_gb: scenario.output_data_volume_gb,
    // Note: source_timeseries_id is not currently in the schema
    // but could be added to track lineage
  }))

  const { data, error } = await supabase
    .from('forecast_scenarios')
    .insert(insertData)
    .select('id')

  if (error) {
    throw new Error(`Failed to save scenarios: ${error.message}`)
  }

  return data.map((row) => row.id)
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handle scenario creation from CreateScenarioModal options
 *
 * This is the main entry point that processes the modal's output
 * and creates the appropriate scenarios.
 *
 * @param options - Options from CreateScenarioModal
 * @param yearlyData - The yearly forecast data
 * @param sourceTimeseriesId - Optional source forecast ID for lineage tracking
 * @returns Array of created scenario IDs
 */
export async function handleCreateScenarios(
  options: CreateScenarioOptions,
  yearlyData: YearlyForecastRow[],
  _sourceTimeseriesId?: string
): Promise<string[]> {
  const validData = yearlyData.filter((row) => row.endOfYearSims > 0)

  if (validData.length === 0) {
    throw new Error('No valid yearly data available')
  }

  let scenarios: GeneratedScenario[]

  if (options.type === 'per_year') {
    // Generate one scenario per year
    // Extract the name prefix from the first scenario name (remove the year suffix)
    const namePrefix = options.scenarioNames[0]?.replace(/ - \d{4}$/, '') || 'Forecast'
    scenarios = generatePerYearScenarios(validData, namePrefix, options.customerId)
  } else {
    // Generate consolidated scenario
    const strategy = options.consolidationStrategy || 'peak'
    scenarios = [
      generateConsolidatedScenario(
        validData,
        options.scenarioNames[0] || 'Consolidated Scenario',
        strategy,
        options.customerId,
        options.customValues
      ),
    ]
  }

  // Save to database
  const scenarioIds = await saveScenarios(scenarios, _sourceTimeseriesId)

  return scenarioIds
}

/**
 * Get forecast scenarios by IDs
 */
export async function getScenariosByIds(ids: string[]): Promise<ForecastScenario[]> {
  if (ids.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('forecast_scenarios')
    .select('*, customer:customers(*)')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to fetch scenarios: ${error.message}`)
  }

  return data as ForecastScenario[]
}
