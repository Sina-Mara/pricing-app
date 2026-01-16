// Database types matching Supabase schema

export type PricingMode = 'stepped' | 'smooth' | 'manual'
export type SkuCategory = 'default' | 'cas' | 'cno' | 'ccs'
export type EnvironmentType = 'production' | 'reference'
export type QuoteStatus = 'draft' | 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'ordered'
export type PackageStatus = 'new' | 'ordered' | 'existing' | 'cancelled'

export interface Sku {
  id: string
  code: string
  description: string
  unit: string
  category: SkuCategory
  is_base_charge: boolean
  is_active: boolean
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
  title: string | null
  notes: string | null
  valid_until: string | null
  use_aggregated_pricing: boolean
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
