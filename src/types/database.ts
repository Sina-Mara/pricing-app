// Database types matching Supabase schema

export type PricingMode = 'stepped' | 'smooth' | 'manual'
export type SkuCategory = 'default' | 'cas' | 'cno' | 'ccs'
export type EnvironmentType = 'production' | 'reference'
export type QuoteStatus = 'draft' | 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'ordered'
export type PackageStatus = 'new' | 'ordered' | 'existing' | 'cancelled'
export type QuoteType = 'commitment' | 'pay_per_use'

export interface Sku {
  id: string
  code: string
  description: string
  unit: string
  category: SkuCategory
  is_base_charge: boolean
  is_direct_cost: boolean
  is_active: boolean
  application: string | null
  component: string | null
  created_at: string
  updated_at: string
}

export interface PricingModel {
  id: string
  sku_id: string
  base_qty: number
  base_unit_price: number
  per_double_discount: number
  floor_unit_price: number
  steps: number
  mode: PricingMode
  max_qty: number
  breakpoints: number[] | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Ladder {
  id: string
  sku_id: string
  min_qty: number
  max_qty: number | null
  unit_price: number
  created_at: string
  updated_at: string
}

export interface TermFactor {
  id: string
  category: SkuCategory
  term_months: number
  factor: number
  created_at: string
  updated_at: string
}

export interface BaseCharge {
  id: string
  sku_id: string
  base_mrc: number
  apply_term_discount: boolean
  created_at: string
  updated_at: string
}

export interface EnvFactor {
  id: string
  sku_id: string
  environment: EnvironmentType
  factor: number
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  quote_number: string
  customer_id: string | null
  status: QuoteStatus
  quote_type: QuoteType
  title: string | null
  solution: string | null
  notes: string | null
  valid_until: string | null
  use_aggregated_pricing: boolean
  base_usage_ratio: number
  total_monthly: number
  total_annual: number
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined data
  customer?: Customer
  quote_packages?: QuotePackage[]
}

export interface QuotePackage {
  id: string
  quote_id: string
  package_name: string
  term_months: number
  status: PackageStatus
  include_in_quote: boolean
  notes: string | null
  sort_order: number
  subtotal_monthly: number
  subtotal_annual: number
  created_at: string
  updated_at: string
  // Joined data
  quote_items?: QuoteItem[]
}

export interface QuoteItem {
  id: string
  package_id: string
  sku_id: string
  quantity: number
  term_months: number | null
  environment: EnvironmentType
  notes: string | null
  list_price: number | null
  volume_discount_pct: number | null
  term_discount_pct: number | null
  env_factor: number | null
  unit_price: number | null
  total_discount_pct: number | null
  usage_total: number | null
  base_charge: number | null
  monthly_total: number | null
  annual_total: number | null
  aggregated_qty: number | null
  pricing_phases: object | null
  ratio_factor: number | null
  sort_order: number
  created_at: string
  updated_at: string
  // Joined data
  sku?: Sku
}

// View types
export interface SkuPricingSummary {
  id: string
  code: string
  description: string
  unit: string
  category: SkuCategory
  is_base_charge: boolean
  is_direct_cost: boolean
  pricing_mode: PricingMode | null
  base_unit_price: number | null
  per_double_discount: number | null
  base_mrc: number | null
  apply_term_discount: boolean | null
}

export interface QuoteSummary {
  id: string
  quote_number: string
  title: string | null
  status: QuoteStatus
  quote_type: QuoteType
  customer_name: string | null
  customer_company: string | null
  total_monthly: number
  total_annual: number
  valid_until: string | null
  created_at: string
  package_count: number
  item_count: number
}

// API response types
export interface PricingResult {
  item_id: string
  list_price: number
  volume_discount_pct: number
  term_discount_pct: number
  env_factor: number
  unit_price: number
  total_discount_pct: number
  usage_total: number
  base_charge: number
  monthly_total: number
  annual_total: number
  aggregated_qty: number | null
  pricing_phases: object | null
  ratio_factor: number | null
}

export interface CalculatePricingResponse {
  success: boolean
  total_monthly?: number
  total_annual?: number
  items?: PricingResult[]
  error?: string
}

// Perpetual licensing types
export interface PerpetualConfig {
  id: string
  parameter: string
  value: number
  description: string | null
  created_at: string
  updated_at: string
}

export interface PerpetualPricingResult {
  perpetual_license: number
  annual_maintenance: number
  total_maintenance: number
  upgrade_protection: number
  total_perpetual: number
}

export interface QuoteWithPerpetual extends Quote {
  include_perpetual_pricing: boolean
  perpetual_total: number | null
}

export interface QuoteItemWithPerpetual extends QuoteItem {
  perpetual_license: number | null
  perpetual_maintenance: number | null
  perpetual_total: number | null
}

// Forecast scenario types
export type ForecastKpiType = 'udr' | 'pcs' | 'ccs' | 'scs' | 'cos' | 'peak_throughput' | 'avg_throughput'

export interface ForecastScenario {
  id: string
  customer_id: string | null
  name: string
  description: string | null
  // Inputs
  total_sims: number
  gb_per_sim: number
  // Config
  take_rate_pcs_udr: number
  take_rate_ccs_udr: number
  take_rate_scs_pcs: number
  peak_average_ratio: number
  busy_hours: number
  days_per_month: number
  // Cached outputs
  output_udr: number | null
  output_pcs: number | null
  output_ccs: number | null
  output_scs: number | null
  output_cos: number | null
  output_peak_throughput: number | null
  output_avg_throughput: number | null
  output_data_volume_gb: number | null
  // Metadata
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined data
  customer?: Customer
}

export interface ForecastSkuMapping {
  id: string
  kpi_type: ForecastKpiType
  sku_id: string
  multiplier: number
  is_active: boolean
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // Joined data
  sku?: Sku
}

// Quote versioning types
export interface QuoteWithVersioning extends Quote {
  version_group_id: string | null
  version_number: number
  version_name: string | null
  parent_quote_id: string | null
  source_scenario_id: string | null
}

export interface QuoteVersion {
  id: string
  quote_number: string
  title: string | null
  status: QuoteStatus
  version_group_id: string | null
  version_number: number
  version_name: string | null
  parent_quote_id: string | null
  total_monthly: number
  total_annual: number
  created_at: string
  updated_at: string
  customer_name: string | null
  customer_company: string | null
  version_count: number
}

export interface QuoteHistory {
  id: string
  quote_id: string
  changed_by: string | null
  change_type: 'create' | 'update' | 'delete'
  old_values: object | null
  new_values: object | null
  created_at: string
}

// Time-series forecast types
export type TimeseriesGranularity = 'monthly' | 'yearly'
export type TimeseriesPricingMode = 'pay_per_use' | 'fixed_commitment'
export type CommitmentStrategy = 'peak' | 'average' | 'p90' | 'p95' | 'custom'

export interface TimeseriesForecast {
  id: string
  customer_id: string | null
  name: string
  description: string | null
  // Time range
  granularity: TimeseriesGranularity
  start_date: string
  end_date: string
  total_periods: number
  // Config
  take_rate_pcs_udr: number
  take_rate_ccs_udr: number
  take_rate_scs_pcs: number
  peak_average_ratio: number
  busy_hours: number
  days_per_month: number
  // Import metadata
  original_filename: string | null
  // Custom config (stores original yearly data for yearly granularity)
  config?: YearlyForecastConfig | null
  // Metadata
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined data
  customer?: Customer
  data_points?: TimeseriesForecastData[]
}

// Config structure for yearly forecasts
export interface YearlyForecastConfig {
  yearlyData: {
    year: number
    endOfYearSims: number
    totalDataUsageGB: number
  }[]
}

export interface TimeseriesForecastData {
  id: string
  forecast_id: string
  period_index: number
  period_date: string
  // Inputs
  total_sims: number
  gb_per_sim: number
  // Calculated outputs
  output_udr: number | null
  output_pcs: number | null
  output_ccs: number | null
  output_scs: number | null
  output_cos: number | null
  output_peak_throughput: number | null
  output_avg_throughput: number | null
  output_data_volume_gb: number | null
}

export interface TimeseriesForecastSummary {
  id: string
  name: string
  description: string | null
  customer_id: string | null
  granularity: TimeseriesGranularity
  start_date: string
  end_date: string
  total_periods: number
  original_filename: string | null
  created_at: string
  updated_at: string
  customer_name: string | null
  customer_company: string | null
  data_point_count: number
  min_sims: number | null
  max_sims: number | null
  avg_sims: number | null
}

// Parsed Excel data format
export interface ParsedTimeseriesData {
  periods: {
    date: Date
    label: string
  }[]
  kpis: {
    name: string
    values: (number | null)[]
  }[]
  granularity: TimeseriesGranularity
  startDate: Date
  endDate: Date
}

// Pricing calculation result types
export interface TimeseriesPeriodPricing {
  periodIndex: number
  periodDate: string
  periodLabel: string
  // KPI values
  totalSims: number
  gbPerSim: number
  udr: number
  pcs: number
  ccs: number
  scs: number
  cos: number
  peakThroughput: number
  avgThroughput: number
  dataVolumeGb: number
  // Pricing
  monthlyTotal: number
  breakdown: {
    skuCode: string
    skuDescription: string
    quantity: number
    unitPrice: number
    total: number
  }[]
}

export interface TimeseriesPayPerUsePricing {
  mode: 'pay_per_use'
  termMonths: 1
  periods: TimeseriesPeriodPricing[]
  totalMonthly: number[]  // Array of monthly totals
  grandTotal: number
  averageMonthly: number
}

export interface TimeseriesFixedCommitmentPricing {
  mode: 'fixed_commitment'
  strategy: CommitmentStrategy
  termMonths: number
  // Committed quantities
  committedQuantities: {
    udr: number
    pcs: number
    ccs: number
    scs: number
    cos: number
    peakThroughput: number
  }
  // Pricing
  monthlyTotal: number
  termDiscount: number
  volumeDiscount: number
  breakdown: {
    skuCode: string
    skuDescription: string
    quantity: number
    unitPrice: number
    total: number
  }[]
}

export interface TimeseriesPricingComparison {
  payPerUse: TimeseriesPayPerUsePricing
  fixedCommitment: TimeseriesFixedCommitmentPricing
  savings: number  // Positive = fixed commitment is cheaper
  savingsPercent: number
}

// Quote with timeseries support
export interface QuoteWithTimeseries extends Quote {
  source_timeseries_id: string | null
  timeseries_pricing_mode: TimeseriesPricingMode | null
}
