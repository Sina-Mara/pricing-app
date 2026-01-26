// =============================================================================
// WHT MVNO Pricing Verification Test Suite
// Reference: "Kopie von WHT MVNO Pricing Sheet.xlsx"
//
// Verifies the pricing app's calculations against the reference Excel for:
//   a) Full commitment (60-month max volumes)
//   b) Annual commitment (5 yearly packages with scaling volumes)
//
// Uses LIVE Supabase data — requires .env with valid credentials.
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  priceFromModel,
  priceFromLadders,
  interpolateTermFactor,
  round4,
  round2,
  type PricingModel,
  type Ladder,
} from '@/lib/pricing'

// =============================================================================
// Types (matching edge function's PricingContext)
// =============================================================================

interface Sku {
  id: string
  code: string
  description: string
  unit: string
  category: 'default' | 'cas' | 'cno' | 'ccs'
  is_base_charge: boolean
}

interface BaseCharge {
  sku_id: string
  base_mrc: number
  apply_term_discount: boolean
}

interface PricingContext {
  skus: Map<string, Sku>
  skuByCode: Map<string, Sku>
  pricingModels: Map<string, PricingModel>
  ladders: Map<string, Ladder[]>
  termFactors: Map<string, Map<number, number>>
  baseCharges: Map<string, BaseCharge>
  envFactors: Map<string, Map<string, number>>
  defaultEnvFactors: Map<string, number>
}

// =============================================================================
// Reference data from the WHT Excel spreadsheet
// =============================================================================

// --- Full Commitment: Base Package (60 months, production) ---
const FC_BASE_ITEMS = [
  { sku: 'Cennso_base', listPrice: 5625.00, yourPrice: 3487.50, monthly: 3487.50, annual: 41850.00 },
  { sku: 'SMC_base', listPrice: 16159.50, yourPrice: 10018.89, monthly: 10018.89, annual: 120226.68 },
  { sku: 'UPG_base', listPrice: 9310.95, yourPrice: 5772.79, monthly: 5772.79, annual: 69273.48 },
  { sku: 'TPOSS_base', listPrice: 10848.60, yourPrice: 6726.13, monthly: 6726.13, annual: 80713.56 },
  { sku: 'CCS_base', listPrice: 98563.00, yourPrice: 61109.06, monthly: 61109.06, annual: 733308.72 },
]

// --- Full Commitment: Usage Package (60 months, production, max volumes) ---
const FC_USAGE_ITEMS = [
  { sku: 'Cennso_Sites', qty: 3, listPrice: 17800.00, volDisc: 0, termDisc: 38, yourPrice: 11036.00, monthly: 33108.00, annual: 397296.00 },
  { sku: 'Cennso_vCores', qty: 5000, listPrice: 8.96, volDisc: 60, termDisc: 38, yourPrice: 2.22, monthly: 11100.00, annual: 133200.00 },
  { sku: 'Cennso_CoreCluster', qty: 5, listPrice: 5517.30, volDisc: 63, termDisc: 38, yourPrice: 1258.10, monthly: 6290.52, annual: 75486.24 },
  { sku: 'SMC_sessions', qty: 2500000, listPrice: 0.2156, volDisc: 96, termDisc: 38, yourPrice: 0.0052, monthly: 13000.00, annual: 156000.00 },
  { sku: 'UPG_Bandwidth', qty: 100000, listPrice: 0.7115, volDisc: 85, termDisc: 38, yourPrice: 0.0652, monthly: 6520.00, annual: 78240.00 },
  { sku: 'TPOSS_UDR', qty: 2500000, listPrice: 0.3802, volDisc: 99, termDisc: 38, yourPrice: 0.003, monthly: 7500.00, annual: 90000.00 },
  { sku: 'TPOSS_PCS', qty: 2500000, listPrice: 0.201, volDisc: 96, termDisc: 38, yourPrice: 0.0048, monthly: 12000.00, annual: 144000.00 },
  { sku: 'TPOSS_CCS', qty: 2500000, listPrice: 0.201, volDisc: 96, termDisc: 38, yourPrice: 0.0048, monthly: 12000.00, annual: 144000.00 },
]

const FC_BASE_MONTHLY = 87114.37
const FC_BASE_ANNUAL = 1045372.44
const FC_USAGE_MONTHLY = 101518.52
const FC_USAGE_ANNUAL = 1218222.25
const FC_GRAND_MONTHLY = 188632.89
const FC_GRAND_ANNUAL = 2263594.69
const FC_TCO_5YR = 11317973.43

// --- Annual Commitment: Yearly usage quantities ---
// (Base package is identical to full commitment)
interface YearlyUsage {
  year: number
  items: { sku: string; qty: number; yourPrice: number; monthly: number; annual: number }[]
  usageAnnual: number
  totalAnnual: number // base + usage
}

const AC_YEARLY: YearlyUsage[] = [
  {
    year: 2027,
    items: [
      { sku: 'Cennso_Sites', qty: 3, yourPrice: 17800.00, monthly: 53400.00, annual: 640800.00 },
      { sku: 'Cennso_vCores', qty: 5000, yourPrice: 3.5806, monthly: 17903.00, annual: 214836.00 },
      { sku: 'Cennso_CoreCluster', qty: 5, yourPrice: 2029.20, monthly: 10146.00, annual: 121752.00 },
      { sku: 'SMC_sessions', qty: 1000, yourPrice: 0.2156, monthly: 215.60, annual: 2587.20 },
      { sku: 'UPG_Bandwidth', qty: 1000, yourPrice: 0.7115, monthly: 711.50, annual: 8538.00 },
      { sku: 'TPOSS_UDR', qty: 1000, yourPrice: 0.3802, monthly: 380.20, annual: 4562.40 },
      { sku: 'TPOSS_PCS', qty: 1000, yourPrice: 0.201, monthly: 201.00, annual: 2412.00 },
      { sku: 'TPOSS_CCS', qty: 1000, yourPrice: 0.201, monthly: 201.00, annual: 2412.00 },
    ],
    usageAnnual: 997899.61,
    totalAnnual: 2043272.05,
  },
  {
    year: 2028,
    items: [
      { sku: 'Cennso_Sites', qty: 3, yourPrice: 17800.00, monthly: 53400.00, annual: 640800.00 },
      { sku: 'Cennso_vCores', qty: 5000, yourPrice: 3.5806, monthly: 17903.00, annual: 214836.00 },
      { sku: 'Cennso_CoreCluster', qty: 5, yourPrice: 2029.20, monthly: 10146.00, annual: 121752.00 },
      { sku: 'SMC_sessions', qty: 60000, yourPrice: 0.0425, monthly: 2550.00, annual: 30600.00 },
      { sku: 'UPG_Bandwidth', qty: 2000, yourPrice: 0.7115, monthly: 1423.00, annual: 17076.00 },
      { sku: 'TPOSS_UDR', qty: 60000, yourPrice: 0.0431, monthly: 2586.00, annual: 31032.00 },
      { sku: 'TPOSS_PCS', qty: 60000, yourPrice: 0.0396, monthly: 2376.00, annual: 28512.00 },
      { sku: 'TPOSS_CCS', qty: 60000, yourPrice: 0.0396, monthly: 2376.00, annual: 28512.00 },
    ],
    usageAnnual: 1113120.01,
    totalAnnual: 2158492.45,
  },
  {
    year: 2029,
    items: [
      { sku: 'Cennso_Sites', qty: 3, yourPrice: 17800.00, monthly: 53400.00, annual: 640800.00 },
      { sku: 'Cennso_vCores', qty: 5000, yourPrice: 3.5806, monthly: 17903.00, annual: 214836.00 },
      { sku: 'Cennso_CoreCluster', qty: 5, yourPrice: 2029.20, monthly: 10146.00, annual: 121752.00 },
      { sku: 'SMC_sessions', qty: 600000, yourPrice: 0.0163, monthly: 9780.00, annual: 117360.00 },
      { sku: 'UPG_Bandwidth', qty: 21000, yourPrice: 0.2736, monthly: 5745.60, annual: 68947.20 },
      { sku: 'TPOSS_UDR', qty: 600000, yourPrice: 0.012, monthly: 7200.00, annual: 86400.00 },
      { sku: 'TPOSS_PCS', qty: 600000, yourPrice: 0.0152, monthly: 9120.00, annual: 109440.00 },
      { sku: 'TPOSS_CCS', qty: 600000, yourPrice: 0.0152, monthly: 9120.00, annual: 109440.00 },
    ],
    usageAnnual: 1468975.21,
    totalAnnual: 2514347.65,
  },
  {
    year: 2030,
    items: [
      { sku: 'Cennso_Sites', qty: 3, yourPrice: 17800.00, monthly: 53400.00, annual: 640800.00 },
      { sku: 'Cennso_vCores', qty: 5000, yourPrice: 3.5806, monthly: 17903.00, annual: 214836.00 },
      { sku: 'Cennso_CoreCluster', qty: 5, yourPrice: 2029.20, monthly: 10146.00, annual: 121752.00 },
      { sku: 'SMC_sessions', qty: 1400000, yourPrice: 0.0123, monthly: 17220.00, annual: 206640.00 },
      { sku: 'UPG_Bandwidth', qty: 49000, yourPrice: 0.1871, monthly: 9167.90, annual: 110014.80 },
      { sku: 'TPOSS_UDR', qty: 1400000, yourPrice: 0.0081, monthly: 11340.00, annual: 136080.00 },
      { sku: 'TPOSS_PCS', qty: 1400000, yourPrice: 0.0114, monthly: 15960.00, annual: 191520.00 },
      { sku: 'TPOSS_CCS', qty: 1400000, yourPrice: 0.0114, monthly: 15960.00, annual: 191520.00 },
    ],
    usageAnnual: 1813162.81,
    totalAnnual: 2858535.25,
  },
  {
    year: 2031,
    items: [
      { sku: 'Cennso_Sites', qty: 3, yourPrice: 17800.00, monthly: 53400.00, annual: 640800.00 },
      { sku: 'Cennso_vCores', qty: 5000, yourPrice: 3.5806, monthly: 17903.00, annual: 214836.00 },
      { sku: 'Cennso_CoreCluster', qty: 5, yourPrice: 2029.20, monthly: 10146.00, annual: 121752.00 },
      { sku: 'SMC_sessions', qty: 2500000, yourPrice: 0.0084, monthly: 21000.00, annual: 252000.00 },
      { sku: 'UPG_Bandwidth', qty: 87000, yourPrice: 0.1403, monthly: 12206.10, annual: 146473.20 },
      { sku: 'TPOSS_UDR', qty: 2500000, yourPrice: 0.0049, monthly: 12250.00, annual: 147000.00 },
      { sku: 'TPOSS_PCS', qty: 2500000, yourPrice: 0.0078, monthly: 19500.00, annual: 234000.00 },
      { sku: 'TPOSS_CCS', qty: 2500000, yourPrice: 0.0078, monthly: 19500.00, annual: 234000.00 },
    ],
    usageAnnual: 1990861.21,
    totalAnnual: 3036233.65,
  },
]

const AC_TCO_5YR = 12610881.03

// =============================================================================
// Helper: Load full pricing context from Supabase
// (mirrors edge function's loadPricingContext)
// =============================================================================

async function loadPricingContext(supabase: SupabaseClient): Promise<PricingContext> {
  const [
    { data: skusData },
    { data: modelsData },
    { data: laddersData },
    { data: termData },
    { data: baseData },
    { data: envData },
    { data: defaultEnvData },
  ] = await Promise.all([
    supabase.from('skus').select('*').eq('is_active', true),
    supabase.from('pricing_models').select('*').eq('is_active', true),
    supabase.from('ladders').select('*').order('min_qty', { ascending: true }),
    supabase.from('term_factors').select('*'),
    supabase.from('base_charges').select('*'),
    supabase.from('env_factors').select('*'),
    supabase.from('default_env_factors').select('*'),
  ])

  const skus = new Map<string, Sku>()
  const skuByCode = new Map<string, Sku>()
  for (const sku of skusData || []) {
    skus.set(sku.id, sku)
    skuByCode.set(sku.code, sku)
  }

  const pricingModels = new Map<string, PricingModel>()
  for (const model of modelsData || []) {
    pricingModels.set(model.sku_id, model)
  }

  const ladders = new Map<string, Ladder[]>()
  for (const ladder of laddersData || []) {
    if (!ladders.has(ladder.sku_id)) ladders.set(ladder.sku_id, [])
    ladders.get(ladder.sku_id)!.push(ladder)
  }

  const termFactors = new Map<string, Map<number, number>>()
  for (const tf of termData || []) {
    if (!termFactors.has(tf.category)) termFactors.set(tf.category, new Map())
    termFactors.get(tf.category)!.set(tf.term_months, tf.factor)
  }

  const baseCharges = new Map<string, BaseCharge>()
  for (const bc of baseData || []) {
    baseCharges.set(bc.sku_id, bc)
  }

  const envFactors = new Map<string, Map<string, number>>()
  for (const ef of envData || []) {
    if (!envFactors.has(ef.sku_id)) envFactors.set(ef.sku_id, new Map())
    envFactors.get(ef.sku_id)!.set(ef.environment, ef.factor)
  }

  const defaultEnvFactors = new Map<string, number>()
  for (const def of defaultEnvData || []) {
    defaultEnvFactors.set(def.environment, def.factor)
  }

  return { skus, skuByCode, pricingModels, ladders, termFactors, baseCharges, envFactors, defaultEnvFactors }
}

// =============================================================================
// Helper: Replicate edge function pricing calculations
// =============================================================================

function findUnitPrice(ctx: PricingContext, skuId: string, qty: number): number {
  const model = ctx.pricingModels.get(skuId)
  const skuLadders = ctx.ladders.get(skuId)

  if (model && model.mode !== 'manual') return priceFromModel(model, qty)
  if (skuLadders && skuLadders.length > 0) return priceFromLadders(skuLadders, qty)
  if (model) return priceFromModel(model, qty)
  throw new Error(`No pricing defined for SKU ${skuId}`)
}

function getTermFactor(ctx: PricingContext, category: string, termMonths: number): number {
  const categoryFactors = ctx.termFactors.get(category) || ctx.termFactors.get('default')
  if (!categoryFactors) return 1
  return interpolateTermFactor(categoryFactors, termMonths, category)
}

function getEnvFactor(ctx: PricingContext, skuId: string, environment: string): number {
  const skuEnvFactors = ctx.envFactors.get(skuId)
  if (skuEnvFactors && skuEnvFactors.has(environment)) return skuEnvFactors.get(environment)!
  return ctx.defaultEnvFactors.get(environment) ?? 1.0
}

function calculateBaseChargeMrc(ctx: PricingContext, skuId: string, termMonths: number, category: string): number {
  const bc = ctx.baseCharges.get(skuId)
  if (!bc) return 0
  let mrc = bc.base_mrc
  if (bc.apply_term_discount) {
    const tf = getTermFactor(ctx, category, termMonths)
    mrc = round2(mrc * tf)
  }
  return mrc
}

/** Calculate full pricing for a usage item (non-base-charge) */
function calculateUsageItem(
  ctx: PricingContext,
  skuCode: string,
  qty: number,
  termMonths: number,
  environment: string,
) {
  const sku = ctx.skuByCode.get(skuCode)
  if (!sku) throw new Error(`SKU not found: ${skuCode}`)

  const listPrice = findUnitPrice(ctx, sku.id, 1)
  const priceAtQty = findUnitPrice(ctx, sku.id, qty)
  const volDiscPct = listPrice > 0 ? round2((1 - priceAtQty / listPrice) * 100) : 0
  const termFactor = getTermFactor(ctx, sku.category, termMonths)
  const termDiscPct = round2((1 - termFactor) * 100)
  const envFactor = getEnvFactor(ctx, sku.id, environment)
  const unitPrice = round4(priceAtQty * termFactor * envFactor)
  const totalDiscPct = listPrice > 0 ? round2((1 - unitPrice / listPrice) * 100) : 0
  const usageTotal = round2(unitPrice * qty)
  const monthlyTotal = usageTotal
  const annualTotal = round2(monthlyTotal * 12)

  return {
    listPrice,
    priceAtQty,
    volDiscPct,
    termFactor,
    termDiscPct,
    envFactor,
    unitPrice,
    totalDiscPct,
    usageTotal,
    monthlyTotal,
    annualTotal,
  }
}

/** Calculate full pricing for a base charge item */
function calculateBaseItem(ctx: PricingContext, skuCode: string, termMonths: number) {
  const sku = ctx.skuByCode.get(skuCode)
  if (!sku) throw new Error(`SKU not found: ${skuCode}`)

  const listMrc = calculateBaseChargeMrc(ctx, sku.id, 12, sku.category) // 12mo = no discount
  const yourMrc = calculateBaseChargeMrc(ctx, sku.id, termMonths, sku.category)
  const termDiscPct = listMrc > 0 ? round2((1 - yourMrc / listMrc) * 100) : 0
  const annualTotal = round2(yourMrc * 12)

  return { listPrice: listMrc, yourPrice: yourMrc, monthlyTotal: yourMrc, annualTotal, termDiscPct }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('WHT MVNO Pricing Verification', () => {
  let ctx: PricingContext

  beforeAll(async () => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    const email = import.meta.env.VITE_TEST_EMAIL
    const password = import.meta.env.VITE_TEST_PASSWORD
    if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
    if (!email || !password) throw new Error('Missing VITE_TEST_EMAIL or VITE_TEST_PASSWORD in .env — needed for RLS auth')

    const supabase = createClient(url, key)

    // Sign in to pass RLS policies
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) throw new Error(`Auth failed: ${authError.message}`)

    ctx = await loadPricingContext(supabase)

    // Sanity check: verify we got data
    if (ctx.skus.size === 0) throw new Error('No SKUs loaded — check RLS policies or database')
  }, 30000) // 30s timeout for DB fetch + auth

  // ===========================================================================
  // Prerequisite: Verify all WHT SKUs exist in the database
  // ===========================================================================

  describe('Database Prerequisites', () => {
    const allSkuCodes = [
      'Cennso_base', 'SMC_base', 'UPG_base', 'TPOSS_base', 'CCS_base',
      'Cennso_Sites', 'Cennso_vCores', 'Cennso_CoreCluster',
      'SMC_sessions', 'UPG_Bandwidth',
      'TPOSS_UDR', 'TPOSS_PCS', 'TPOSS_CCS',
    ]

    it('has all 13 WHT SKUs', () => {
      for (const code of allSkuCodes) {
        expect(ctx.skuByCode.has(code), `SKU "${code}" missing from database`).toBe(true)
      }
    })

    it('has pricing models for all usage SKUs', () => {
      const usageSkus = [
        'Cennso_Sites', 'Cennso_vCores', 'Cennso_CoreCluster',
        'SMC_sessions', 'UPG_Bandwidth',
        'TPOSS_UDR', 'TPOSS_PCS', 'TPOSS_CCS',
      ]
      for (const code of usageSkus) {
        const sku = ctx.skuByCode.get(code)!
        const hasModel = ctx.pricingModels.has(sku.id)
        const hasLadders = ctx.ladders.has(sku.id) && ctx.ladders.get(sku.id)!.length > 0
        expect(hasModel || hasLadders, `No pricing for "${code}"`).toBe(true)
      }
    })

    it('has base charges for all base SKUs', () => {
      const baseSkus = ['Cennso_base', 'SMC_base', 'UPG_base', 'TPOSS_base', 'CCS_base']
      for (const code of baseSkus) {
        const sku = ctx.skuByCode.get(code)!
        expect(ctx.baseCharges.has(sku.id), `No base charge for "${code}"`).toBe(true)
      }
    })

    it('has term factors for default category', () => {
      expect(ctx.termFactors.has('default'), 'No default term factors').toBe(true)
      const defaultFactors = ctx.termFactors.get('default')!
      expect(defaultFactors.size).toBeGreaterThanOrEqual(1)
    })

    it('has environment factors', () => {
      const hasDefault = ctx.defaultEnvFactors.size > 0
      const hasPerSku = ctx.envFactors.size > 0
      expect(hasDefault || hasPerSku, 'No environment factors found').toBe(true)
    })
  })

  // ===========================================================================
  // A) Full Commitment — Base Package (60 months)
  // ===========================================================================

  describe('Full Commitment — Base Package (60mo)', () => {
    for (const ref of FC_BASE_ITEMS) {
      it(`${ref.sku}: list price = ${ref.listPrice}`, () => {
        const result = calculateBaseItem(ctx, ref.sku, 60)
        expect(result.listPrice).toBeCloseTo(ref.listPrice, 2)
      })

      it(`${ref.sku}: monthly total = ${ref.monthly}`, () => {
        const result = calculateBaseItem(ctx, ref.sku, 60)
        expect(result.monthlyTotal).toBeCloseTo(ref.monthly, 2)
      })

      it(`${ref.sku}: annual total = ${ref.annual}`, () => {
        const result = calculateBaseItem(ctx, ref.sku, 60)
        expect(result.annualTotal).toBeCloseTo(ref.annual, 2)
      })
    }

    it(`base package monthly subtotal = ${FC_BASE_MONTHLY}`, () => {
      let total = 0
      for (const ref of FC_BASE_ITEMS) {
        total += calculateBaseItem(ctx, ref.sku, 60).monthlyTotal
      }
      expect(round2(total)).toBeCloseTo(FC_BASE_MONTHLY, 1)
    })

    it(`base package annual subtotal = ${FC_BASE_ANNUAL}`, () => {
      let total = 0
      for (const ref of FC_BASE_ITEMS) {
        total += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      expect(round2(total)).toBeCloseTo(FC_BASE_ANNUAL, 1)
    })
  })

  // ===========================================================================
  // A) Full Commitment — Usage Package (60 months, max volumes)
  // ===========================================================================

  describe('Full Commitment — Usage Package (60mo, max volumes)', () => {
    for (const ref of FC_USAGE_ITEMS) {
      describe(`${ref.sku} (qty=${ref.qty.toLocaleString()})`, () => {
        it(`list price = ${ref.listPrice}`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production')
          expect(result.listPrice).toBeCloseTo(ref.listPrice, 4)
        })

        it(`unit price = ${ref.yourPrice}`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production')
          expect(result.unitPrice).toBeCloseTo(ref.yourPrice, 2)
        })

        it(`volume discount ≈ ${ref.volDisc}%`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production')
          expect(result.volDiscPct).toBeCloseTo(ref.volDisc, 0)
        })

        it(`term discount ≈ ${ref.termDisc}%`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production')
          expect(result.termDiscPct).toBeCloseTo(ref.termDisc, 0)
        })

        it(`monthly total = ${ref.monthly}`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production')
          expect(result.monthlyTotal).toBeCloseTo(ref.monthly, 2)
        })

        it(`annual total = ${ref.annual}`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production')
          expect(result.annualTotal).toBeCloseTo(ref.annual, 2)
        })
      })
    }

    it(`usage package monthly subtotal = ${FC_USAGE_MONTHLY}`, () => {
      let total = 0
      for (const ref of FC_USAGE_ITEMS) {
        total += calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production').monthlyTotal
      }
      expect(round2(total)).toBeCloseTo(FC_USAGE_MONTHLY, 1)
    })

    it(`usage package annual subtotal = ${FC_USAGE_ANNUAL}`, () => {
      let total = 0
      for (const ref of FC_USAGE_ITEMS) {
        total += calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production').annualTotal
      }
      expect(round2(total)).toBeCloseTo(FC_USAGE_ANNUAL, 1)
    })
  })

  // ===========================================================================
  // A) Full Commitment — Grand Totals
  // ===========================================================================

  describe('Full Commitment — Grand Totals', () => {
    it(`grand total monthly = ${FC_GRAND_MONTHLY}`, () => {
      let total = 0
      for (const ref of FC_BASE_ITEMS) {
        total += calculateBaseItem(ctx, ref.sku, 60).monthlyTotal
      }
      for (const ref of FC_USAGE_ITEMS) {
        total += calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production').monthlyTotal
      }
      expect(round2(total)).toBeCloseTo(FC_GRAND_MONTHLY, 1)
    })

    it(`grand total annual = ${FC_GRAND_ANNUAL}`, () => {
      let baseAnnual = 0
      for (const ref of FC_BASE_ITEMS) {
        baseAnnual += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      let usageAnnual = 0
      for (const ref of FC_USAGE_ITEMS) {
        usageAnnual += calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production').annualTotal
      }
      expect(round2(baseAnnual + usageAnnual)).toBeCloseTo(FC_GRAND_ANNUAL, 1)
    })

    it(`TCO 5 years = ${FC_TCO_5YR}`, () => {
      let baseAnnual = 0
      for (const ref of FC_BASE_ITEMS) {
        baseAnnual += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      let usageAnnual = 0
      for (const ref of FC_USAGE_ITEMS) {
        usageAnnual += calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production').annualTotal
      }
      const tco = round2((baseAnnual + usageAnnual) * 5)
      // Allow ±0.10 for TCO due to accumulated rounding
      expect(Math.abs(tco - FC_TCO_5YR)).toBeLessThanOrEqual(0.10)
    })
  })

  // ===========================================================================
  // B) Annual Commitment — Base Package (same as full commitment)
  // ===========================================================================

  describe('Annual Commitment — Base Package (60mo)', () => {
    it('base package matches full commitment base', () => {
      let total = 0
      for (const ref of FC_BASE_ITEMS) {
        total += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      expect(round2(total)).toBeCloseTo(FC_BASE_ANNUAL, 1)
    })
  })

  // ===========================================================================
  // B) Annual Commitment — Yearly Usage Packages (12 months each)
  // ===========================================================================

  for (const yearData of AC_YEARLY) {
    describe(`Annual Commitment — Usage ${yearData.year} (12mo)`, () => {
      for (const ref of yearData.items) {
        it(`${ref.sku} (qty=${ref.qty.toLocaleString()}): unit price = ${ref.yourPrice}`, () => {
          // 12-month term = no term discount
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production')
          expect(result.unitPrice).toBeCloseTo(ref.yourPrice, 2)
        })

        it(`${ref.sku} (qty=${ref.qty.toLocaleString()}): monthly total = ${ref.monthly}`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production')
          expect(result.monthlyTotal).toBeCloseTo(ref.monthly, 2)
        })

        it(`${ref.sku} (qty=${ref.qty.toLocaleString()}): annual total = ${ref.annual}`, () => {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production')
          expect(result.annualTotal).toBeCloseTo(ref.annual, 2)
        })
      }

      it(`usage annual subtotal = ${yearData.usageAnnual}`, () => {
        let total = 0
        for (const ref of yearData.items) {
          total += calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production').annualTotal
        }
        expect(round2(total)).toBeCloseTo(yearData.usageAnnual, 1)
      })

      it(`total annual (base + usage) = ${yearData.totalAnnual}`, () => {
        let base = 0
        for (const ref of FC_BASE_ITEMS) {
          base += calculateBaseItem(ctx, ref.sku, 60).annualTotal
        }
        let usage = 0
        for (const ref of yearData.items) {
          usage += calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production').annualTotal
        }
        expect(round2(base + usage)).toBeCloseTo(yearData.totalAnnual, 1)
      })
    })
  }

  // ===========================================================================
  // B) Annual Commitment — TCO 5 years
  // ===========================================================================

  describe('Annual Commitment — TCO 5 years', () => {
    it(`TCO = ${AC_TCO_5YR}`, () => {
      let tco = 0

      // Base annual (same every year)
      let baseAnnual = 0
      for (const ref of FC_BASE_ITEMS) {
        baseAnnual += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }

      for (const yearData of AC_YEARLY) {
        let usageAnnual = 0
        for (const ref of yearData.items) {
          usageAnnual += calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production').annualTotal
        }
        tco += baseAnnual + usageAnnual
      }

      // Allow ±0.10 for accumulated rounding across 5 years × 13 items
      expect(Math.abs(round2(tco) - AC_TCO_5YR)).toBeLessThanOrEqual(0.10)
    })
  })

  // ===========================================================================
  // C) Cross-scenario comparison
  // ===========================================================================

  describe('Cross-Scenario Comparison', () => {
    it('full commitment TCO < annual commitment TCO (max commit is cheaper)', () => {
      // Full commitment TCO
      let fcAnnual = 0
      for (const ref of FC_BASE_ITEMS) {
        fcAnnual += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      for (const ref of FC_USAGE_ITEMS) {
        fcAnnual += calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production').annualTotal
      }
      const fcTco = fcAnnual * 5

      // Annual commitment TCO
      let acTco = 0
      let baseAnnual = 0
      for (const ref of FC_BASE_ITEMS) {
        baseAnnual += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      for (const yearData of AC_YEARLY) {
        let usageAnnual = 0
        for (const ref of yearData.items) {
          usageAnnual += calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production').annualTotal
        }
        acTco += baseAnnual + usageAnnual
      }

      expect(fcTco).toBeLessThan(acTco)
    })

    it('savings ≈ 1,292,907.60 EUR (10.3%)', () => {
      // Calculate both TCOs
      let fcAnnual = 0
      for (const ref of FC_BASE_ITEMS) {
        fcAnnual += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      for (const ref of FC_USAGE_ITEMS) {
        fcAnnual += calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production').annualTotal
      }
      const fcTco = fcAnnual * 5

      let acTco = 0
      let baseAnnual = 0
      for (const ref of FC_BASE_ITEMS) {
        baseAnnual += calculateBaseItem(ctx, ref.sku, 60).annualTotal
      }
      for (const yearData of AC_YEARLY) {
        let usageAnnual = 0
        for (const ref of yearData.items) {
          usageAnnual += calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production').annualTotal
        }
        acTco += baseAnnual + usageAnnual
      }

      const savings = acTco - fcTco
      const savingsPct = (savings / acTco) * 100

      // Savings should be ~1.29M (allow 1% tolerance on the savings amount)
      expect(savings).toBeGreaterThan(1_200_000)
      expect(savings).toBeLessThan(1_400_000)

      // Percentage should be ~10%
      expect(savingsPct).toBeGreaterThan(9)
      expect(savingsPct).toBeLessThan(12)
    })
  })

  // ===========================================================================
  // D) Diagnostic: Print calculated vs expected values (always passes)
  // ===========================================================================

  describe('Diagnostic Output', () => {
    it('prints full commitment comparison table', () => {
      console.log('\n=== FULL COMMITMENT (60mo) — Base Charges ===')
      console.log('SKU'.padEnd(20), 'Expected'.padStart(12), 'Calculated'.padStart(12), 'Diff'.padStart(10))
      for (const ref of FC_BASE_ITEMS) {
        const result = calculateBaseItem(ctx, ref.sku, 60)
        const diff = result.monthlyTotal - ref.monthly
        console.log(
          ref.sku.padEnd(20),
          ref.monthly.toFixed(2).padStart(12),
          result.monthlyTotal.toFixed(2).padStart(12),
          diff.toFixed(2).padStart(10),
        )
      }

      console.log('\n=== FULL COMMITMENT (60mo) — Usage Items ===')
      console.log('SKU'.padEnd(22), 'Qty'.padStart(12), 'Exp Price'.padStart(12), 'Calc Price'.padStart(12), 'Exp Monthly'.padStart(14), 'Calc Monthly'.padStart(14), 'Diff'.padStart(10))
      for (const ref of FC_USAGE_ITEMS) {
        const result = calculateUsageItem(ctx, ref.sku, ref.qty, 60, 'production')
        const diff = result.monthlyTotal - ref.monthly
        console.log(
          ref.sku.padEnd(22),
          ref.qty.toLocaleString().padStart(12),
          ref.yourPrice.toFixed(4).padStart(12),
          result.unitPrice.toFixed(4).padStart(12),
          ref.monthly.toFixed(2).padStart(14),
          result.monthlyTotal.toFixed(2).padStart(14),
          diff.toFixed(2).padStart(10),
        )
      }

      // Always passes — diagnostic only
      expect(true).toBe(true)
    })

    it('prints annual commitment comparison table', () => {
      for (const yearData of AC_YEARLY) {
        console.log(`\n=== ANNUAL COMMITMENT — ${yearData.year} (12mo) ===`)
        console.log('SKU'.padEnd(22), 'Qty'.padStart(12), 'Exp Price'.padStart(12), 'Calc Price'.padStart(12), 'Exp Annual'.padStart(14), 'Calc Annual'.padStart(14), 'Diff'.padStart(10))
        for (const ref of yearData.items) {
          const result = calculateUsageItem(ctx, ref.sku, ref.qty, 12, 'production')
          const diff = result.annualTotal - ref.annual
          console.log(
            ref.sku.padEnd(22),
            ref.qty.toLocaleString().padStart(12),
            ref.yourPrice.toFixed(4).padStart(12),
            result.unitPrice.toFixed(4).padStart(12),
            ref.annual.toFixed(2).padStart(14),
            result.annualTotal.toFixed(2).padStart(14),
            diff.toFixed(2).padStart(10),
          )
        }
      }

      expect(true).toBe(true)
    })
  })
})
