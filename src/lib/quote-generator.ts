/**
 * Quote Generator
 *
 * Utility functions for generating quotes from forecast scenarios.
 * Supports commitment quotes with various aggregation strategies
 * and pay-per-use quotes.
 */

import { supabase, invokeEdgeFunction } from '@/lib/supabase'
import type {
  ForecastScenario,
  ForecastSkuMapping,
  Sku,
  ForecastKpiType,
  QuoteType,
  CalculatePricingResponse,
} from '@/types/database'

// =============================================================================
// Types
// =============================================================================

/**
 * Commitment sizing strategy for multi-year/multi-scenario quotes
 */
export type CommitmentSizingStrategy = 'peak' | 'average' | 'specific_year'

/**
 * Options for generating a commitment quote
 */
export interface CommitmentQuoteOptions {
  /** Forecast scenarios to base the quote on */
  scenarios: ForecastScenario[]
  /** Customer ID (optional) */
  customerId?: string
  /** Term length in months (12, 24, 36, etc.) */
  termMonths: number
  /** Strategy for aggregating multiple scenarios */
  strategy: CommitmentSizingStrategy
  /** Specific year to use (required if strategy is 'specific_year') */
  specificYear?: number
  /** Quote title (optional) */
  title?: string
  /** Additional notes (optional) */
  notes?: string
}

/**
 * Aggregated KPI values from scenarios
 */
export interface AggregatedKpiValues {
  udr: number
  pcs: number
  ccs: number
  scs: number
  cos: number
  peakThroughput: number
  avgThroughput: number
  dataVolumeGb: number
  sourceInfo: string
}

/**
 * Preview of commitment quote sizing
 */
export interface CommitmentPreview {
  strategy: CommitmentSizingStrategy
  aggregatedValues: AggregatedKpiValues
  estimatedLineItems: {
    skuCode: string
    skuDescription: string
    quantity: number
    kpiType: ForecastKpiType
  }[]
  scenarioCount: number
  yearRange?: string
}

/**
 * Result of generating a commitment quote
 */
export interface CommitmentQuoteResult {
  quoteId: string
  packageId: string
  quoteNumber?: string
  itemCount: number
}

/**
 * Basic forecast results structure
 */
export interface ForecastResults {
  udr: number
  pcs: number
  ccs: number
  scs: number
  cos: number
  throughputPeak: number
  throughputAverage: number
  dataVolumeGb: number
}

// =============================================================================
// Constants
// =============================================================================

/** Default term for commitment quotes */
const DEFAULT_COMMITMENT_TERM = 36

/** Pay-per-use quotes use 1-month term (no commitment) */
const PAY_PER_USE_TERM = 1

// =============================================================================
// Aggregation Functions
// =============================================================================

/**
 * Extract KPI values from a forecast scenario
 */
function extractKpiValues(scenario: ForecastScenario): AggregatedKpiValues {
  return {
    udr: scenario.output_udr ?? scenario.total_sims ?? 0,
    pcs: scenario.output_pcs ?? 0,
    ccs: scenario.output_ccs ?? 0,
    scs: scenario.output_scs ?? 0,
    cos: scenario.output_cos ?? 0,
    peakThroughput: scenario.output_peak_throughput ?? 0,
    avgThroughput: scenario.output_avg_throughput ?? 0,
    dataVolumeGb: scenario.output_data_volume_gb ?? 0,
    sourceInfo: scenario.name,
  }
}

/**
 * Calculate peak values across multiple scenarios
 * Uses the maximum value for each KPI
 */
function aggregatePeakValues(scenarios: ForecastScenario[]): AggregatedKpiValues {
  if (scenarios.length === 0) {
    return {
      udr: 0, pcs: 0, ccs: 0, scs: 0, cos: 0,
      peakThroughput: 0, avgThroughput: 0, dataVolumeGb: 0,
      sourceInfo: 'No scenarios',
    }
  }

  if (scenarios.length === 1) {
    return extractKpiValues(scenarios[0])
  }

  const values = scenarios.map(extractKpiValues)
  const peakScenario = scenarios.reduce((max, s) =>
    (s.output_udr ?? s.total_sims ?? 0) > (max.output_udr ?? max.total_sims ?? 0) ? s : max
  )

  return {
    udr: Math.max(...values.map(v => v.udr)),
    pcs: Math.max(...values.map(v => v.pcs)),
    ccs: Math.max(...values.map(v => v.ccs)),
    scs: Math.max(...values.map(v => v.scs)),
    cos: Math.max(...values.map(v => v.cos)),
    peakThroughput: Math.max(...values.map(v => v.peakThroughput)),
    avgThroughput: Math.max(...values.map(v => v.avgThroughput)),
    dataVolumeGb: Math.max(...values.map(v => v.dataVolumeGb)),
    sourceInfo: `Peak values (${scenarios.length} scenarios, max from "${peakScenario.name}")`,
  }
}

/**
 * Calculate average values across multiple scenarios
 */
function aggregateAverageValues(scenarios: ForecastScenario[]): AggregatedKpiValues {
  if (scenarios.length === 0) {
    return {
      udr: 0, pcs: 0, ccs: 0, scs: 0, cos: 0,
      peakThroughput: 0, avgThroughput: 0, dataVolumeGb: 0,
      sourceInfo: 'No scenarios',
    }
  }

  if (scenarios.length === 1) {
    return extractKpiValues(scenarios[0])
  }

  const values = scenarios.map(extractKpiValues)
  const count = values.length

  return {
    udr: Math.ceil(values.reduce((sum, v) => sum + v.udr, 0) / count),
    pcs: Math.ceil(values.reduce((sum, v) => sum + v.pcs, 0) / count),
    ccs: Math.ceil(values.reduce((sum, v) => sum + v.ccs, 0) / count),
    scs: Math.ceil(values.reduce((sum, v) => sum + v.scs, 0) / count),
    cos: Math.ceil(values.reduce((sum, v) => sum + v.cos, 0) / count),
    peakThroughput: values.reduce((sum, v) => sum + v.peakThroughput, 0) / count,
    avgThroughput: values.reduce((sum, v) => sum + v.avgThroughput, 0) / count,
    dataVolumeGb: values.reduce((sum, v) => sum + v.dataVolumeGb, 0) / count,
    sourceInfo: `Average values (${scenarios.length} scenarios)`,
  }
}

/**
 * Get values from a specific scenario by year
 * Attempts to match year from scenario name (e.g., "Forecast - 2026")
 */
function getValuesForYear(scenarios: ForecastScenario[], year: number): AggregatedKpiValues {
  // Try to find scenario by year in name
  const yearScenario = scenarios.find(s => {
    const match = s.name.match(/\b(20\d{2})\b/)
    return match && parseInt(match[1]) === year
  })

  if (yearScenario) {
    const values = extractKpiValues(yearScenario)
    values.sourceInfo = `Year ${year} (from "${yearScenario.name}")`
    return values
  }

  // If no year match, use first scenario
  if (scenarios.length > 0) {
    const values = extractKpiValues(scenarios[0])
    values.sourceInfo = `No match for ${year}, using first scenario`
    return values
  }

  return {
    udr: 0, pcs: 0, ccs: 0, scs: 0, cos: 0,
    peakThroughput: 0, avgThroughput: 0, dataVolumeGb: 0,
    sourceInfo: `Year ${year} not found`,
  }
}

/**
 * Aggregate scenario values based on the specified strategy
 */
export function aggregateScenarioValues(
  scenarios: ForecastScenario[],
  strategy: CommitmentSizingStrategy,
  specificYear?: number
): AggregatedKpiValues {
  switch (strategy) {
    case 'peak':
      return aggregatePeakValues(scenarios)
    case 'average':
      return aggregateAverageValues(scenarios)
    case 'specific_year':
      if (specificYear === undefined) {
        throw new Error('specificYear is required for specific_year strategy')
      }
      return getValuesForYear(scenarios, specificYear)
    default:
      return aggregatePeakValues(scenarios)
  }
}

/**
 * Extract years from scenario names
 * Returns sorted unique years found in scenario names
 */
export function extractYearsFromScenarios(scenarios: ForecastScenario[]): number[] {
  const years = new Set<number>()

  for (const scenario of scenarios) {
    const match = scenario.name.match(/\b(20\d{2})\b/)
    if (match) {
      years.add(parseInt(match[1]))
    }
  }

  return Array.from(years).sort((a, b) => a - b)
}

/**
 * Get year range string from scenarios
 */
export function getYearRangeFromScenarios(scenarios: ForecastScenario[]): string | undefined {
  const years = extractYearsFromScenarios(scenarios)
  if (years.length === 0) return undefined
  if (years.length === 1) return years[0].toString()
  return `${years[0]}-${years[years.length - 1]}`
}

// =============================================================================
// SKU Mapping Functions
// =============================================================================

/**
 * Fetch forecast SKU mappings from the database
 */
export async function fetchSkuMappings(): Promise<(ForecastSkuMapping & { sku: Sku })[]> {
  const { data, error } = await supabase
    .from('forecast_sku_mappings')
    .select('*, sku:skus(*)')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    throw new Error(`Failed to fetch SKU mappings: ${error.message}`)
  }

  return data as (ForecastSkuMapping & { sku: Sku })[]
}

/**
 * Maps aggregated values to KPI type record
 */
function mapValuesToKpis(values: AggregatedKpiValues): Record<ForecastKpiType, number> {
  return {
    udr: values.udr,
    pcs: values.pcs,
    ccs: values.ccs,
    scs: values.scs,
    cos: values.cos,
    peak_throughput: values.peakThroughput,
    avg_throughput: values.avgThroughput,
  }
}

// =============================================================================
// Preview Functions
// =============================================================================

/**
 * Generate a preview of what the commitment quote would look like
 */
export async function generateCommitmentPreview(
  scenarios: ForecastScenario[],
  strategy: CommitmentSizingStrategy,
  specificYear?: number
): Promise<CommitmentPreview> {
  const aggregatedValues = aggregateScenarioValues(scenarios, strategy, specificYear)
  const mappings = await fetchSkuMappings()

  // Map KPI values to line items
  const kpiValues = mapValuesToKpis(aggregatedValues)

  const estimatedLineItems = mappings
    .filter(m => m.is_active && m.sku && kpiValues[m.kpi_type] !== undefined)
    .map(mapping => ({
      skuCode: mapping.sku!.code,
      skuDescription: mapping.sku!.description,
      quantity: Math.ceil(kpiValues[mapping.kpi_type] * mapping.multiplier),
      kpiType: mapping.kpi_type,
    }))
    .filter(item => item.quantity > 0)

  return {
    strategy,
    aggregatedValues,
    estimatedLineItems,
    scenarioCount: scenarios.length,
    yearRange: getYearRangeFromScenarios(scenarios),
  }
}

/**
 * Generate previews for all strategies (for comparison UI)
 */
export async function generateAllStrategyPreviews(
  scenarios: ForecastScenario[]
): Promise<{
  peak: CommitmentPreview
  average: CommitmentPreview
  years: number[]
}> {
  const [peak, average] = await Promise.all([
    generateCommitmentPreview(scenarios, 'peak'),
    generateCommitmentPreview(scenarios, 'average'),
  ])

  return {
    peak,
    average,
    years: extractYearsFromScenarios(scenarios),
  }
}

// =============================================================================
// Quote Generation Functions
// =============================================================================

/**
 * Generate a commitment quote from forecast scenarios
 *
 * This function:
 * 1. Aggregates scenario values based on strategy
 * 2. Creates a new quote with quote_type: 'commitment'
 * 3. Creates a package with the specified term_months
 * 4. Fetches SKU mappings from forecast_sku_mappings
 * 5. Creates quote items with aggregated quantities
 * 6. Triggers pricing calculation with term discounts
 *
 * @param options - Commitment quote options
 * @returns Quote ID, Package ID, and item count
 */
export async function generateCommitmentQuote(
  options: CommitmentQuoteOptions
): Promise<CommitmentQuoteResult> {
  const {
    scenarios,
    customerId,
    termMonths,
    strategy,
    specificYear,
    title,
    notes,
  } = options

  if (scenarios.length === 0) {
    throw new Error('At least one scenario is required')
  }

  // Validate specific_year strategy
  if (strategy === 'specific_year' && specificYear === undefined) {
    throw new Error('specificYear is required for specific_year strategy')
  }

  // Step 1: Aggregate scenario values
  const aggregatedValues = aggregateScenarioValues(scenarios, strategy, specificYear)

  // Step 2: Fetch SKU mappings
  const mappings = await fetchSkuMappings()

  if (mappings.length === 0) {
    throw new Error('No active SKU mappings configured. Please configure mappings in Admin > Forecast Mapping.')
  }

  // Step 3: Create the quote
  const versionGroupId = crypto.randomUUID()
  const yearRange = getYearRangeFromScenarios(scenarios)
  const primaryScenario = scenarios[0]

  const strategyLabel = strategy === 'specific_year' ? `Year ${specificYear}` : strategy
  const defaultTitle = title || `Commitment Quote${yearRange ? ` (${yearRange})` : ''} - ${strategyLabel}`

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      customer_id: customerId || primaryScenario.customer_id || null,
      title: defaultTitle,
      status: 'draft',
      quote_type: 'commitment',
      use_aggregated_pricing: true,
      notes: notes || `Generated from ${scenarios.length} scenario(s) using ${strategy} strategy. ${aggregatedValues.sourceInfo}`,
      version_group_id: versionGroupId,
      version_number: 1,
      source_scenario_id: primaryScenario.id,
    })
    .select('id, quote_number')
    .single()

  if (quoteError) {
    throw new Error(`Failed to create quote: ${quoteError.message}`)
  }

  // Step 4: Create the package
  const packageName = `${strategy.charAt(0).toUpperCase() + strategy.slice(1).replace('_', ' ')} Commitment - ${termMonths} months`

  const { data: pkg, error: pkgError } = await supabase
    .from('quote_packages')
    .insert({
      quote_id: quote.id,
      package_name: packageName,
      term_months: termMonths,
      status: 'new',
      sort_order: 1,
    })
    .select('id')
    .single()

  if (pkgError) {
    throw new Error(`Failed to create package: ${pkgError.message}`)
  }

  // Step 5: Create line items based on mappings
  const kpiValues = mapValuesToKpis(aggregatedValues)

  const itemsToCreate = mappings
    .filter(m => m.is_active && kpiValues[m.kpi_type] !== undefined)
    .map((mapping, index) => {
      const quantity = Math.ceil(kpiValues[mapping.kpi_type] * mapping.multiplier)
      return {
        package_id: pkg.id,
        sku_id: mapping.sku_id,
        quantity: Math.max(1, quantity),
        environment: 'production' as const,
        sort_order: index + 1,
        notes: `${mapping.kpi_type.toUpperCase()}: ${kpiValues[mapping.kpi_type].toLocaleString()} x ${mapping.multiplier}`,
      }
    })
    .filter(item => item.quantity > 0)

  if (itemsToCreate.length > 0) {
    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(itemsToCreate)

    if (itemsError) {
      throw new Error(`Failed to create quote items: ${itemsError.message}`)
    }
  }

  // Step 6: Trigger pricing calculation
  try {
    await invokeEdgeFunction<CalculatePricingResponse>(
      'calculate-pricing',
      { action: 'calculate_quote', quote_id: quote.id }
    )
  } catch (error) {
    // Log but don't fail - pricing can be calculated later
    console.warn('Failed to calculate initial pricing:', error)
  }

  return {
    quoteId: quote.id,
    packageId: pkg.id,
    quoteNumber: quote.quote_number,
    itemCount: itemsToCreate.length,
  }
}

/**
 * Generate a pay-per-use quote from forecast scenarios
 * Uses 1-month term with no term discounts
 */
export async function generatePayPerUseQuote(
  scenarios: ForecastScenario[],
  customerId?: string,
  title?: string
): Promise<CommitmentQuoteResult> {
  if (scenarios.length === 0) {
    throw new Error('At least one scenario is required')
  }

  // Use peak values for pay-per-use sizing
  const aggregatedValues = aggregatePeakValues(scenarios)
  const mappings = await fetchSkuMappings()

  if (mappings.length === 0) {
    throw new Error('No active SKU mappings configured.')
  }

  const versionGroupId = crypto.randomUUID()
  const primaryScenario = scenarios[0]
  const scenarioName = scenarios.length === 1
    ? primaryScenario.name
    : `${scenarios.length} Scenarios`

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      customer_id: customerId || primaryScenario.customer_id || null,
      title: title || `Pay-per-Use Quote from ${scenarioName}`,
      status: 'draft',
      quote_type: 'pay_per_use',
      use_aggregated_pricing: false,
      version_group_id: versionGroupId,
      version_number: 1,
      source_scenario_id: primaryScenario.id,
    })
    .select('id, quote_number')
    .single()

  if (quoteError) {
    throw new Error(`Failed to create quote: ${quoteError.message}`)
  }

  const { data: pkg, error: pkgError } = await supabase
    .from('quote_packages')
    .insert({
      quote_id: quote.id,
      package_name: scenarioName || 'Pay-per-Use Package',
      term_months: PAY_PER_USE_TERM,
      status: 'new',
      sort_order: 1,
    })
    .select('id')
    .single()

  if (pkgError) {
    throw new Error(`Failed to create package: ${pkgError.message}`)
  }

  const kpiValues = mapValuesToKpis(aggregatedValues)

  const itemsToCreate = mappings
    .filter(m => m.is_active && kpiValues[m.kpi_type] !== undefined)
    .map((mapping, index) => ({
      package_id: pkg.id,
      sku_id: mapping.sku_id,
      quantity: Math.ceil(kpiValues[mapping.kpi_type] * mapping.multiplier),
      environment: 'production' as const,
      sort_order: index + 1,
      notes: `Auto-generated from forecast (${mapping.kpi_type.toUpperCase()})`,
    }))
    .filter(item => item.quantity > 0)

  if (itemsToCreate.length > 0) {
    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(itemsToCreate)

    if (itemsError) {
      throw new Error(`Failed to create line items: ${itemsError.message}`)
    }
  }

  try {
    await invokeEdgeFunction<CalculatePricingResponse>(
      'calculate-pricing',
      { action: 'calculate_quote', quote_id: quote.id }
    )
  } catch (error) {
    console.warn('Initial pricing calculation failed:', error)
  }

  return {
    quoteId: quote.id,
    packageId: pkg.id,
    quoteNumber: quote.quote_number,
    itemCount: itemsToCreate.length,
  }
}

// =============================================================================
// Strategy Information
// =============================================================================

/**
 * Get display information for a commitment strategy
 */
export function getStrategyInfo(strategy: CommitmentSizingStrategy): {
  label: string
  description: string
  icon: string
} {
  switch (strategy) {
    case 'peak':
      return {
        label: 'Peak Values',
        description: 'Size for maximum capacity. Uses the highest value for each metric across all scenarios/years.',
        icon: 'TrendingUp',
      }
    case 'average':
      return {
        label: 'Average Values',
        description: 'Size for typical usage. Uses the average value for each metric across all scenarios/years.',
        icon: 'BarChart2',
      }
    case 'specific_year':
      return {
        label: 'Specific Year',
        description: 'Size for a specific year. Uses values from the selected year only.',
        icon: 'Calendar',
      }
    default:
      return {
        label: 'Unknown',
        description: 'Unknown strategy',
        icon: 'HelpCircle',
      }
  }
}

/**
 * Get term discount tier label
 */
export function getTermTierLabel(termMonths: number): string {
  if (termMonths >= 60) return '60+ months (Maximum discount)'
  if (termMonths >= 48) return '48-59 months'
  if (termMonths >= 36) return '36-47 months'
  if (termMonths >= 24) return '24-35 months'
  if (termMonths >= 12) return '12-23 months'
  return 'Under 12 months (No term discount)'
}

/**
 * Update a quote's type and recalculate pricing
 */
export async function updateQuoteType(
  quoteId: string,
  newQuoteType: QuoteType,
  newTermMonths?: number
): Promise<void> {
  const { error: quoteError } = await supabase
    .from('quotes')
    .update({
      quote_type: newQuoteType,
      use_aggregated_pricing: newQuoteType === 'commitment',
    })
    .eq('id', quoteId)

  if (quoteError) {
    throw new Error(`Failed to update quote type: ${quoteError.message}`)
  }

  const termMonths = newQuoteType === 'pay_per_use'
    ? PAY_PER_USE_TERM
    : (newTermMonths || DEFAULT_COMMITMENT_TERM)

  const { error: pkgError } = await supabase
    .from('quote_packages')
    .update({ term_months: termMonths })
    .eq('quote_id', quoteId)

  if (pkgError) {
    throw new Error(`Failed to update package terms: ${pkgError.message}`)
  }

  try {
    await invokeEdgeFunction<CalculatePricingResponse>(
      'calculate-pricing',
      { action: 'calculate_quote', quote_id: quoteId }
    )
  } catch (error) {
    console.warn('Pricing recalculation failed after type change:', error)
  }
}
