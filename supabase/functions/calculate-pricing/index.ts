// ============================================================================
// PRICING ENGINE - SUPABASE EDGE FUNCTION
// supabase/functions/calculate-pricing/index.ts
//
// Ported from Google Apps Script pricing engine
// Handles: volume discounts, term factors, environment factors, aggregation
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPES
// ============================================================================

interface Sku {
  id: string;
  code: string;
  description: string;
  unit: string;
  category: 'default' | 'cas' | 'cno' | 'ccs';
  is_base_charge: boolean;
}

interface PricingModel {
  sku_id: string;
  base_qty: number;
  base_unit_price: number;
  per_double_discount: number;
  floor_unit_price: number;
  steps: number;
  mode: 'stepped' | 'smooth' | 'manual';
  max_qty: number;
  breakpoints: number[] | null;
}

interface Ladder {
  sku_id: string;
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
}

interface TermFactor {
  category: string;
  term_months: number;
  factor: number;
}

interface BaseCharge {
  sku_id: string;
  base_mrc: number;
  apply_term_discount: boolean;
}

interface EnvFactor {
  sku_id: string;
  environment: string;
  factor: number;
}

interface QuoteItem {
  id: string;
  package_id: string;
  sku_id: string;
  quantity: number;
  term_months: number | null;
  environment: 'production' | 'reference';
}

interface PricingResult {
  item_id: string;
  list_price: number;
  volume_discount_pct: number;
  term_discount_pct: number;
  env_factor: number;
  unit_price: number;
  total_discount_pct: number;
  usage_total: number;
  base_charge: number;
  monthly_total: number;
  annual_total: number;
  aggregated_qty: number | null;
  pricing_phases: object | null;
  ratio_factor: number | null;
}

interface PricingContext {
  skus: Map<string, Sku>;
  pricingModels: Map<string, PricingModel>;
  ladders: Map<string, Ladder[]>;
  termFactors: Map<string, Map<number, number>>;
  baseCharges: Map<string, BaseCharge>;
  envFactors: Map<string, Map<string, number>>;
  defaultEnvFactors: Map<string, number>;
}

interface TimePhase {
  start: number;
  end: number;
  totalQty: number;
  items: { pkgId: string; qty: number; term: number }[];
}

interface PhasePrice {
  unitPrice: number;
  duration: number;
  totalQty: number;
}

interface WeightedPriceData {
  pkgId: string;
  weightedPrice: number;
  totalWeight: number;
  finalPrice?: number;
  phasesList: {
    phase: string;
    months: number;
    unitPrice: number;
    totalQty: number;
  }[];
}

interface QuotePackage {
  id: string;
  term_months: number;
  start_date?: string;
  end_date?: string;
  quote_items: QuoteItem[];
}

interface PerpetualConfig {
  compensation_term_months: number;
  maintenance_reduction_factor: number;
  maintenance_term_years: number;
  upgrade_protection_percent: number;
  maintenance_percent_cas: number;
  maintenance_percent_cno: number;
  maintenance_percent_default: number;
  exclude_cno_from_perpetual: boolean;
}

interface PerpetualPricingResult {
  perpetual_license: number;
  annual_maintenance: number;
  total_maintenance: number;
  upgrade_protection: number;
  total_perpetual: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Reference ratio at which DB prices were seeded (60% base / 40% usage)
const CAS_REFERENCE_BASE_RATIO = 0.60;
const CAS_REFERENCE_USAGE_RATIO = 0.40;

// ============================================================================
// TERM FACTOR CALCULATION (with interpolation)
// ============================================================================

function interpolateTermFactor(
  termFactors: Map<number, number>,
  targetTerm: number,
  category: string
): number {
  // If exact match exists, use it
  if (termFactors.has(targetTerm)) {
    return termFactors.get(targetTerm)!;
  }

  // Get all available term points, sorted
  const termPoints = Array.from(termFactors.keys()).sort((a, b) => a - b);

  if (termPoints.length === 0) return 1;
  if (termPoints.length === 1) return termFactors.get(termPoints[0])!;

  // If target is below lowest term, use lowest term factor
  if (targetTerm <= termPoints[0]) {
    return termFactors.get(termPoints[0])!;
  }

  // If target is above highest term, extrapolate
  if (targetTerm >= termPoints[termPoints.length - 1]) {
    if (termPoints.length >= 2) {
      const lastTerm = termPoints[termPoints.length - 1];
      const secondLastTerm = termPoints[termPoints.length - 2];
      const lastFactor = termFactors.get(lastTerm)!;
      const secondLastFactor = termFactors.get(secondLastTerm)!;

      const ratePerMonth = (lastFactor - secondLastFactor) / (lastTerm - secondLastTerm);
      let extrapolatedFactor = lastFactor + ratePerMonth * (targetTerm - lastTerm);

      // Apply category-specific caps
      if (category === 'cas') {
        if (targetTerm >= 60) {
          extrapolatedFactor = Math.min(0.52, extrapolatedFactor);
        } else {
          const minFactor = lastFactor * 0.25;
          extrapolatedFactor = Math.max(minFactor, extrapolatedFactor);
        }
      } else {
        const minFactor = lastFactor * 0.5;
        extrapolatedFactor = Math.max(minFactor, extrapolatedFactor);
      }

      return round4(extrapolatedFactor);
    }
    return termFactors.get(termPoints[termPoints.length - 1])!;
  }

  // Find the two points to interpolate between
  let lowerTerm = termPoints[0];
  let upperTerm = termPoints[termPoints.length - 1];

  for (let i = 0; i < termPoints.length - 1; i++) {
    if (targetTerm > termPoints[i] && targetTerm < termPoints[i + 1]) {
      lowerTerm = termPoints[i];
      upperTerm = termPoints[i + 1];
      break;
    }
  }

  // Linear interpolation
  const lowerFactor = termFactors.get(lowerTerm)!;
  const upperFactor = termFactors.get(upperTerm)!;
  const ratio = (targetTerm - lowerTerm) / (upperTerm - lowerTerm);

  return round4(lowerFactor + ratio * (upperFactor - lowerFactor));
}

function getTermFactor(ctx: PricingContext, category: string, termMonths: number): number {
  const categoryFactors = ctx.termFactors.get(category) || ctx.termFactors.get('default');
  if (!categoryFactors) return 1;
  return interpolateTermFactor(categoryFactors, termMonths, category);
}

// ============================================================================
// PRICE CALCULATION FROM MODEL
// ============================================================================

function geometricBounds(baseQty: number, maxQty: number, steps: number): number[] {
  const b = Math.max(1, Math.floor(baseQty));
  const M = Math.max(b, Math.floor(maxQty));
  const s = Math.max(2, Math.floor(steps));

  if (b === M) return [b, M];

  const ratio = Math.pow(M / b, 1 / (s - 1));
  const arr: number[] = [];

  for (let i = 0; i < s; i++) {
    arr.push(b * Math.pow(ratio, i));
  }

  arr[0] = b;
  arr[arr.length - 1] = M;

  return arr;
}

function boundsFromModel(model: PricingModel): number[] {
  const maxQ = model.max_qty || 1e12;

  if (model.mode === 'stepped' && model.breakpoints && model.breakpoints.length > 0) {
    let arr = [...model.breakpoints];
    if (!arr.includes(model.base_qty)) arr.push(model.base_qty);
    arr = arr.filter(n => n >= 1 && n <= maxQ);
    arr = [...new Set(arr)].sort((a, b) => a - b);

    if (arr.length === 0) arr = [model.base_qty];
    if (arr[arr.length - 1] < maxQ) arr.push(maxQ);
    if (arr.length < 2) arr = [model.base_qty, maxQ];

    return arr;
  }

  const steps = Math.max(2, Math.floor(model.steps || 10));
  return geometricBounds(model.base_qty, maxQ, steps);
}

function priceFromModel(model: PricingModel, qty: number): number {
  const q = Math.max(qty, model.base_qty);
  const factorPerDouble = 1 - model.per_double_discount;

  if (model.mode === 'smooth') {
    const doubles = Math.log(q / model.base_qty) / Math.log(2);
    const smooth = model.base_unit_price * Math.pow(factorPerDouble, Math.max(0, doubles));
    return round4(Math.max(model.floor_unit_price, smooth));
  }

  // Stepped pricing
  const bounds = boundsFromModel(model);
  let idx = 0;

  for (let i = 0; i < bounds.length - 1; i++) {
    if (q >= bounds[i] && q < bounds[i + 1]) {
      idx = i;
      break;
    }
    if (q >= bounds[bounds.length - 1]) {
      idx = bounds.length - 2;
    }
  }

  const doublesAtBucket = Math.log(bounds[idx] / model.base_qty) / Math.log(2);
  const step = model.base_unit_price * Math.pow(factorPerDouble, Math.max(0, doublesAtBucket));

  return round4(Math.max(model.floor_unit_price, step));
}

// ============================================================================
// PRICE CALCULATION FROM LADDERS
// ============================================================================

function priceFromLadders(ladders: Ladder[], qty: number): number {
  if (!ladders || ladders.length === 0) {
    throw new Error('No ladder defined');
  }

  for (const tier of ladders) {
    const maxQty = tier.max_qty ?? 1e12;
    if (qty >= tier.min_qty && qty <= maxQty) {
      return round4(tier.unit_price);
    }
  }

  // Fall back to last tier if quantity exceeds all tiers
  const lastTier = ladders[ladders.length - 1];
  if (lastTier.max_qty === null && qty >= lastTier.min_qty) {
    return round4(lastTier.unit_price);
  }

  throw new Error(`No matching tier for qty ${qty}`);
}

// ============================================================================
// MAIN UNIT PRICE CALCULATION
// ============================================================================

function findUnitPrice(ctx: PricingContext, skuId: string, qty: number): number {
  const model = ctx.pricingModels.get(skuId);
  const ladders = ctx.ladders.get(skuId);

  // If model exists and is not manual mode, use model
  if (model && model.mode !== 'manual') {
    return priceFromModel(model, qty);
  }

  // Otherwise use ladders
  if (ladders && ladders.length > 0) {
    return priceFromLadders(ladders, qty);
  }

  // If model exists but is manual and no ladders, use model anyway
  if (model) {
    return priceFromModel(model, qty);
  }

  throw new Error(`No pricing defined for SKU`);
}

// ============================================================================
// ENVIRONMENT FACTOR
// ============================================================================

function getEnvFactor(ctx: PricingContext, skuId: string, environment: string): number {
  // Check SKU-specific factor first
  const skuEnvFactors = ctx.envFactors.get(skuId);
  if (skuEnvFactors && skuEnvFactors.has(environment)) {
    return skuEnvFactors.get(environment)!;
  }

  // Fall back to default environment factor
  return ctx.defaultEnvFactors.get(environment) ?? 1.0;
}

// ============================================================================
// BASE CHARGE CALCULATION
// ============================================================================

function calculateBaseCharge(
  ctx: PricingContext,
  skuId: string,
  termMonths: number,
  category: string
): number {
  const baseCharge = ctx.baseCharges.get(skuId);
  if (!baseCharge) return 0;

  let mrc = baseCharge.base_mrc;

  if (baseCharge.apply_term_discount) {
    const termFactor = getTermFactor(ctx, category, termMonths);
    mrc = round2(mrc * termFactor);
  }

  return mrc;
}

// ============================================================================
// CALCULATE PRICING FOR A SINGLE ITEM
// ============================================================================

function calculateItemPricing(
  ctx: PricingContext,
  item: QuoteItem,
  packageTermMonths: number,
  aggregatedQty?: number
): PricingResult {
  const sku = ctx.skus.get(item.sku_id);
  if (!sku) {
    throw new Error(`SKU not found: ${item.sku_id}`);
  }

  const termMonths = item.term_months ?? packageTermMonths;
  const qty = item.quantity;
  const pricingQty = aggregatedQty ?? qty;

  const result: PricingResult = {
    item_id: item.id,
    list_price: 0,
    volume_discount_pct: 0,
    term_discount_pct: 0,
    env_factor: 1,
    unit_price: 0,
    total_discount_pct: 0,
    usage_total: 0,
    base_charge: 0,
    monthly_total: 0,
    annual_total: 0,
    aggregated_qty: aggregatedQty ?? null,
    pricing_phases: null,
    ratio_factor: null,
  };

  if (sku.is_base_charge) {
    // Base charge pricing
    const baseMrc = calculateBaseCharge(ctx, sku.id, termMonths, sku.category);
    const listBaseMrc = calculateBaseCharge(ctx, sku.id, 12, sku.category); // List price at 12 months

    result.base_charge = baseMrc;
    result.monthly_total = baseMrc;
    result.unit_price = baseMrc;
    result.list_price = listBaseMrc;

    if (listBaseMrc > 0) {
      result.term_discount_pct = round2((1 - baseMrc / listBaseMrc) * 100);
      result.total_discount_pct = result.term_discount_pct;
    }
  } else {
    // Usage-based pricing
    
    // List price (qty=1, no discounts)
    try {
      result.list_price = findUnitPrice(ctx, sku.id, 1);
    } catch {
      result.list_price = 0;
    }

    // Price at quantity (volume discount)
    const priceAtQty = findUnitPrice(ctx, sku.id, pricingQty);

    // Volume discount
    if (result.list_price > 0) {
      result.volume_discount_pct = round2((1 - priceAtQty / result.list_price) * 100);
    }

    // Term factor
    const termFactor = getTermFactor(ctx, sku.category, termMonths);
    result.term_discount_pct = round2((1 - termFactor) * 100);

    // Environment factor
    result.env_factor = getEnvFactor(ctx, sku.id, item.environment);

    // Final unit price
    result.unit_price = round4(priceAtQty * termFactor * result.env_factor);

    // Total discount
    if (result.list_price > 0) {
      result.total_discount_pct = round2((1 - result.unit_price / result.list_price) * 100);
    }

    // Totals
    result.usage_total = round2(result.unit_price * qty);
    result.monthly_total = result.usage_total;
  }

  result.annual_total = round2(result.monthly_total * 12);

  return result;
}

// ============================================================================
// AGGREGATE QUANTITIES ACROSS PACKAGES
// ============================================================================

function aggregateQuantities(
  items: QuoteItem[],
  skus: Map<string, Sku>
): Map<string, number> {
  const aggregated = new Map<string, number>();

  for (const item of items) {
    const sku = skus.get(item.sku_id);
    if (!sku || sku.is_base_charge) continue;

    const current = aggregated.get(item.sku_id) || 0;
    aggregated.set(item.sku_id, current + item.quantity);
  }

  return aggregated;
}

// ============================================================================
// TIME-PHASED AGGREGATION
// Calculates quantities per time phase based on contract end dates,
// then computes weighted-average prices based on phase durations
// ============================================================================

/**
 * Calculate time-phased quantities across all packages.
 * Phases are determined by unique contract end points.
 *
 * Example: If packages have 12, 24, and 36 month terms:
 * - Phase 1-12: all items active
 * - Phase 13-24: 24 and 36 month items active
 * - Phase 25-36: only 36 month items active
 */
function calculateTimePhaseQuantities(
  packages: QuotePackage[],
  skus: Map<string, Sku>
): Map<string, Map<string, TimePhase>> {
  const skuPhases = new Map<string, Map<string, TimePhase>>();

  // Collect all unique term end points
  const termEndPoints = new Set<number>();
  termEndPoints.add(1); // Start at month 1

  for (const pkg of packages) {
    for (const item of pkg.quote_items) {
      const term = item.term_months ?? pkg.term_months;
      // Add the month AFTER the term ends (exclusive endpoint)
      termEndPoints.add(term + 1);
    }
  }

  // Sort term points
  const sortedTerms = Array.from(termEndPoints).sort((a, b) => a - b);

  // For each SKU, calculate quantities in each time period
  for (const pkg of packages) {
    for (const item of pkg.quote_items) {
      const sku = skus.get(item.sku_id);
      if (!sku || sku.is_base_charge) continue;

      const skuId = item.sku_id;
      const qty = item.quantity;
      const term = item.term_months ?? pkg.term_months;

      if (!skuPhases.has(skuId)) {
        skuPhases.set(skuId, new Map());
      }

      const phases = skuPhases.get(skuId)!;

      // Track this item's contribution to each phase
      for (let i = 0; i < sortedTerms.length - 1; i++) {
        const phaseStart = sortedTerms[i];
        const phaseEnd = sortedTerms[i + 1] - 1; // End is inclusive

        // Create phase key showing inclusive range
        const phaseKey = `${phaseStart}-${phaseEnd}`;

        // Item is active during this phase if the phase starts within the item's term
        if (phaseStart <= term) {
          if (!phases.has(phaseKey)) {
            phases.set(phaseKey, {
              start: phaseStart,
              end: phaseEnd,
              totalQty: 0,
              items: [],
            });
          }

          const phase = phases.get(phaseKey)!;
          phase.totalQty += qty;
          phase.items.push({
            pkgId: pkg.id,
            qty: qty,
            term: term,
          });
        }
      }
    }
  }

  return skuPhases;
}

/**
 * Calculate weighted-average unit prices for each SKU/package combination.
 * Weights are based on the duration of each phase.
 */
function calculateTimeWeightedPrices(
  timePhaseData: Map<string, Map<string, TimePhase>>,
  ctx: PricingContext
): Map<string, Map<string, WeightedPriceData>> {
  const weightedPrices = new Map<string, Map<string, WeightedPriceData>>();

  for (const [skuId, phases] of timePhaseData) {
    weightedPrices.set(skuId, new Map());
    const skuPrices = weightedPrices.get(skuId)!;

    // Calculate unit price for each phase based on total quantity
    const phasePrices = new Map<string, PhasePrice>();

    for (const [phaseKey, phaseInfo] of phases) {
      try {
        const unitPrice = findUnitPrice(ctx, skuId, phaseInfo.totalQty);
        phasePrices.set(phaseKey, {
          unitPrice: unitPrice,
          duration: phaseInfo.end - phaseInfo.start + 1,
          totalQty: phaseInfo.totalQty,
        });
      } catch {
        // Skip if price not found
      }
    }

    // Calculate weighted average price for each item based on its term
    for (const [phaseKey, phaseInfo] of phases) {
      for (const item of phaseInfo.items) {
        const key = `${item.pkgId}_${skuId}`;

        if (!skuPrices.has(key)) {
          skuPrices.set(key, {
            pkgId: item.pkgId,
            weightedPrice: 0,
            totalWeight: 0,
            phasesList: [],
          });
        }

        const data = skuPrices.get(key)!;

        // Calculate how much of this item's term falls within this phase
        const phaseStart = phaseInfo.start;
        const phaseEnd = Math.min(phaseInfo.end, item.term);
        const phaseDuration = phaseEnd - phaseStart + 1;

        if (phaseDuration > 0 && phasePrices.has(phaseKey)) {
          const priceData = phasePrices.get(phaseKey)!;
          const weight = phaseDuration;
          const price = priceData.unitPrice;

          data.weightedPrice += price * weight;
          data.totalWeight += weight;

          // Store phase data for display
          data.phasesList.push({
            phase: phaseKey,
            months: phaseDuration,
            unitPrice: price,
            totalQty: phaseInfo.totalQty,
          });
        }
      }
    }

    // Calculate final weighted average for each package/SKU combination
    for (const [, data] of skuPrices) {
      if (data.totalWeight > 0) {
        data.finalPrice = data.weightedPrice / data.totalWeight;
      }
    }
  }

  return weightedPrices;
}

/**
 * Calculate pricing for a single item using time-weighted prices if available.
 */
function calculateItemPricingWithPhases(
  ctx: PricingContext,
  item: QuoteItem,
  packageTermMonths: number,
  weightedPrices: Map<string, Map<string, WeightedPriceData>> | null,
  baseUsageRatio: number = 0.60
): PricingResult {
  const sku = ctx.skus.get(item.sku_id);
  if (!sku) {
    throw new Error(`SKU not found: ${item.sku_id}`);
  }

  const termMonths = item.term_months ?? packageTermMonths;
  const qty = item.quantity;

  const result: PricingResult = {
    item_id: item.id,
    list_price: 0,
    volume_discount_pct: 0,
    term_discount_pct: 0,
    env_factor: 1,
    unit_price: 0,
    total_discount_pct: 0,
    usage_total: 0,
    base_charge: 0,
    monthly_total: 0,
    annual_total: 0,
    aggregated_qty: null,
    pricing_phases: null,
    ratio_factor: null,
  };

  if (sku.is_base_charge) {
    // Base charge pricing
    const baseMrc = calculateBaseCharge(ctx, sku.id, termMonths, sku.category);
    const listBaseMrc = calculateBaseCharge(ctx, sku.id, 12, sku.category);

    result.base_charge = baseMrc;
    result.monthly_total = baseMrc;
    result.unit_price = baseMrc;
    result.list_price = listBaseMrc;

    if (listBaseMrc > 0) {
      result.term_discount_pct = round2((1 - baseMrc / listBaseMrc) * 100);
      result.total_discount_pct = result.term_discount_pct;
    }

    // Apply base/usage ratio for CAS SKUs
    if (sku.category === 'cas') {
      const ratioFactor = round4(baseUsageRatio / CAS_REFERENCE_BASE_RATIO);
      result.base_charge = round2(result.base_charge * ratioFactor);
      result.monthly_total = result.base_charge;
      result.unit_price = result.base_charge;
      result.ratio_factor = ratioFactor;
    }
  } else {
    // Usage-based pricing

    // List price (qty=1, no discounts)
    try {
      result.list_price = findUnitPrice(ctx, sku.id, 1);
    } catch {
      result.list_price = 0;
    }

    // Check for time-weighted price
    let priceAtQty: number;
    const key = `${item.package_id}_${item.sku_id}`;
    const skuWeightedPrices = weightedPrices?.get(item.sku_id);
    const weightedData = skuWeightedPrices?.get(key);

    if (weightedData?.finalPrice !== undefined) {
      priceAtQty = weightedData.finalPrice;
      // Store phase info for reference
      if (weightedData.phasesList.length > 0) {
        result.pricing_phases = weightedData.phasesList;
        // Calculate aggregated qty from phases
        const maxQty = Math.max(...weightedData.phasesList.map(p => p.totalQty));
        result.aggregated_qty = maxQty;
      }
    } else {
      priceAtQty = findUnitPrice(ctx, sku.id, qty);
    }

    // Volume discount
    if (result.list_price > 0) {
      result.volume_discount_pct = round2((1 - priceAtQty / result.list_price) * 100);
    }

    // Term factor
    const termFactor = getTermFactor(ctx, sku.category, termMonths);
    result.term_discount_pct = round2((1 - termFactor) * 100);

    // Environment factor
    result.env_factor = getEnvFactor(ctx, sku.id, item.environment);

    // Final unit price
    result.unit_price = round4(priceAtQty * termFactor * result.env_factor);

    // Total discount
    if (result.list_price > 0) {
      result.total_discount_pct = round2((1 - result.unit_price / result.list_price) * 100);
    }

    // Totals
    result.usage_total = round2(result.unit_price * qty);
    result.monthly_total = result.usage_total;

    // Apply base/usage ratio for CAS SKUs
    if (sku.category === 'cas') {
      const ratioFactor = round4((1 - baseUsageRatio) / CAS_REFERENCE_USAGE_RATIO);
      result.unit_price = round4(result.unit_price * ratioFactor);
      result.list_price = round4(result.list_price * ratioFactor);
      // Recalculate totals with adjusted price
      result.usage_total = round2(result.unit_price * qty);
      result.monthly_total = result.usage_total;
      result.ratio_factor = ratioFactor;
    }
  }

  result.annual_total = round2(result.monthly_total * 12);

  return result;
}

// ============================================================================
// PERPETUAL PRICING CALCULATION
// ============================================================================

/**
 * Load perpetual config from database
 */
async function loadPerpetualConfig(supabase: any): Promise<PerpetualConfig> {
  const { data } = await supabase.from('perpetual_config').select('*');

  const config: PerpetualConfig = {
    compensation_term_months: 48,
    maintenance_reduction_factor: 0.7,
    maintenance_term_years: 3,
    upgrade_protection_percent: 15,
    maintenance_percent_cas: 27,
    maintenance_percent_cno: 19,
    maintenance_percent_default: 20,
    exclude_cno_from_perpetual: true,
  };

  for (const row of data || []) {
    const param = row.parameter.toLowerCase().replace(/_/g, '_');
    switch (param) {
      case 'compensation_term_months':
        config.compensation_term_months = row.value;
        break;
      case 'maintenance_reduction_factor':
        config.maintenance_reduction_factor = row.value;
        break;
      case 'maintenance_term_years':
        config.maintenance_term_years = row.value;
        break;
      case 'upgrade_protection_percent':
        config.upgrade_protection_percent = row.value;
        break;
      case 'maintenance_percent_cas':
        config.maintenance_percent_cas = row.value;
        break;
      case 'maintenance_percent_cno':
        config.maintenance_percent_cno = row.value;
        break;
      case 'maintenance_percent_default':
        config.maintenance_percent_default = row.value;
        break;
      case 'exclude_cno_from_perpetual':
        config.exclude_cno_from_perpetual = row.value > 0;
        break;
    }
  }

  return config;
}

/**
 * Calculate perpetual pricing for a subscription price
 */
function calculatePerpetualPricing(
  monthlyPrice: number,
  qty: number,
  category: string,
  config: PerpetualConfig
): PerpetualPricingResult {
  // Extract license-only price from subscription (which includes maintenance/support)
  const licenseOnlyPrice = monthlyPrice * config.maintenance_reduction_factor;

  // Base perpetual license = license-only price * compensation term * quantity
  const perpetualLicense = licenseOnlyPrice * qty * config.compensation_term_months;

  // Determine maintenance percentage based on category
  let maintenancePercent = config.maintenance_percent_default;
  const cat = (category || '').toLowerCase();
  if (cat.includes('cas')) {
    maintenancePercent = config.maintenance_percent_cas;
  } else if (cat.includes('cno')) {
    maintenancePercent = config.maintenance_percent_cno;
  }

  // Annual maintenance = perpetual license * maintenance percentage
  const annualMaintenance = perpetualLicense * (maintenancePercent / 100);

  // Total maintenance for the term
  const totalMaintenance = annualMaintenance * config.maintenance_term_years;

  // Upgrade protection
  const upgradeProtection = perpetualLicense * (config.upgrade_protection_percent / 100);

  // Total perpetual cost
  const totalPerpetual = perpetualLicense + totalMaintenance + upgradeProtection;

  return {
    perpetual_license: round2(perpetualLicense),
    annual_maintenance: round2(annualMaintenance),
    total_maintenance: round2(totalMaintenance),
    upgrade_protection: round2(upgradeProtection),
    total_perpetual: round2(totalPerpetual),
  };
}

// ============================================================================
// LOAD PRICING CONTEXT FROM DATABASE
// ============================================================================

async function loadPricingContext(supabase: any): Promise<PricingContext> {
  // Load SKUs
  const { data: skusData } = await supabase
    .from('skus')
    .select('*')
    .eq('is_active', true);

  const skus = new Map<string, Sku>();
  for (const sku of skusData || []) {
    skus.set(sku.id, sku);
  }

  // Load Pricing Models
  const { data: modelsData } = await supabase
    .from('pricing_models')
    .select('*')
    .eq('is_active', true);

  const pricingModels = new Map<string, PricingModel>();
  for (const model of modelsData || []) {
    pricingModels.set(model.sku_id, model);
  }

  // Load Ladders
  const { data: laddersData } = await supabase
    .from('ladders')
    .select('*')
    .order('min_qty', { ascending: true });

  const ladders = new Map<string, Ladder[]>();
  for (const ladder of laddersData || []) {
    if (!ladders.has(ladder.sku_id)) {
      ladders.set(ladder.sku_id, []);
    }
    ladders.get(ladder.sku_id)!.push(ladder);
  }

  // Load Term Factors
  const { data: termData } = await supabase
    .from('term_factors')
    .select('*');

  const termFactors = new Map<string, Map<number, number>>();
  for (const tf of termData || []) {
    if (!termFactors.has(tf.category)) {
      termFactors.set(tf.category, new Map());
    }
    termFactors.get(tf.category)!.set(tf.term_months, tf.factor);
  }

  // Load Base Charges
  const { data: baseData } = await supabase
    .from('base_charges')
    .select('*');

  const baseCharges = new Map<string, BaseCharge>();
  for (const bc of baseData || []) {
    baseCharges.set(bc.sku_id, bc);
  }

  // Load Environment Factors
  const { data: envData } = await supabase
    .from('env_factors')
    .select('*');

  const envFactors = new Map<string, Map<string, number>>();
  for (const ef of envData || []) {
    if (!envFactors.has(ef.sku_id)) {
      envFactors.set(ef.sku_id, new Map());
    }
    envFactors.get(ef.sku_id)!.set(ef.environment, ef.factor);
  }

  // Load Default Environment Factors
  const { data: defaultEnvData } = await supabase
    .from('default_env_factors')
    .select('*');

  const defaultEnvFactors = new Map<string, number>();
  for (const def of defaultEnvData || []) {
    defaultEnvFactors.set(def.environment, def.factor);
  }

  return {
    skus,
    pricingModels,
    ladders,
    termFactors,
    baseCharges,
    envFactors,
    defaultEnvFactors,
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, quote_id, items } = await req.json();

    // Load pricing context
    const ctx = await loadPricingContext(supabase);

    if (action === 'calculate_quote') {
      // Calculate pricing for an entire quote
      const { data: quote } = await supabase
        .from('quotes')
        .select('*, quote_packages(*, quote_items(*))')
        .eq('id', quote_id)
        .single();

      if (!quote) {
        throw new Error('Quote not found');
      }

      const baseUsageRatio = quote.base_usage_ratio ?? 0.60;

      // Convert packages to typed format
      const packages: QuotePackage[] = quote.quote_packages.map((pkg: any) => ({
        id: pkg.id,
        term_months: pkg.term_months,
        start_date: pkg.start_date,
        end_date: pkg.end_date,
        quote_items: pkg.quote_items,
      }));

      // Collect all items for aggregation
      const allItems: QuoteItem[] = [];
      const packageTerms = new Map<string, number>();

      for (const pkg of packages) {
        packageTerms.set(pkg.id, pkg.term_months);
        for (const item of pkg.quote_items) {
          allItems.push(item);
        }
      }

      // Calculate time-phased weighted prices if aggregation is enabled
      let weightedPrices: Map<string, Map<string, WeightedPriceData>> | null = null;
      if (quote.use_aggregated_pricing) {
        const timePhaseData = calculateTimePhaseQuantities(packages, ctx.skus);
        weightedPrices = calculateTimeWeightedPrices(timePhaseData, ctx);
      }

      // Calculate pricing for each item
      const results: PricingResult[] = [];
      let quoteTotalMonthly = 0;
      let quoteTotalAnnual = 0;

      for (const item of allItems) {
        const packageTerm = packageTerms.get(item.package_id) || 12;

        const result = calculateItemPricingWithPhases(ctx, item, packageTerm, weightedPrices, baseUsageRatio);
        results.push(result);

        quoteTotalMonthly += result.monthly_total;
        quoteTotalAnnual += result.annual_total;
      }

      // Update items in database
      for (const result of results) {
        await supabase
          .from('quote_items')
          .update({
            list_price: result.list_price,
            volume_discount_pct: result.volume_discount_pct,
            term_discount_pct: result.term_discount_pct,
            env_factor: result.env_factor,
            unit_price: result.unit_price,
            total_discount_pct: result.total_discount_pct,
            usage_total: result.usage_total,
            base_charge: result.base_charge,
            monthly_total: result.monthly_total,
            annual_total: result.annual_total,
            aggregated_qty: result.aggregated_qty,
            pricing_phases: result.pricing_phases,
            ratio_factor: result.ratio_factor,
          })
          .eq('id', result.item_id);
      }

      // Update quote totals
      await supabase
        .from('quotes')
        .update({
          total_monthly: round2(quoteTotalMonthly),
          total_annual: round2(quoteTotalAnnual),
        })
        .eq('id', quote_id);

      // Update package subtotals
      for (const pkg of quote.quote_packages) {
        const pkgResults = results.filter(r => 
          allItems.find(i => i.id === r.item_id)?.package_id === pkg.id
        );
        const pkgMonthly = pkgResults.reduce((sum, r) => sum + r.monthly_total, 0);
        const pkgAnnual = pkgResults.reduce((sum, r) => sum + r.annual_total, 0);

        await supabase
          .from('quote_packages')
          .update({
            subtotal_monthly: round2(pkgMonthly),
            subtotal_annual: round2(pkgAnnual),
          })
          .eq('id', pkg.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          total_monthly: round2(quoteTotalMonthly),
          total_annual: round2(quoteTotalAnnual),
          items: results,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    if (action === 'calculate_items') {
      // Calculate pricing for standalone items (preview/calculator)
      const results: PricingResult[] = [];

      for (const item of items) {
        const result = calculateItemPricing(ctx, item, item.term_months || 12);
        results.push(result);
      }

      return new Response(
        JSON.stringify({ success: true, items: results }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    if (action === 'get_price_tiers') {
      // Return all price tiers for a SKU (for display)
      const { sku_id } = await req.json();
      const model = ctx.pricingModels.get(sku_id);
      const skuLadders = ctx.ladders.get(sku_id);

      const tiers: { min: number; max: number | null; price: number }[] = [];

      if (model && model.mode !== 'manual') {
        const bounds = boundsFromModel(model);
        for (let i = 0; i < bounds.length - 1; i++) {
          tiers.push({
            min: Math.round(bounds[i]),
            max: Math.round(bounds[i + 1]) - 1,
            price: priceFromModel(model, bounds[i]),
          });
        }
        tiers.push({
          min: Math.round(bounds[bounds.length - 1]),
          max: null,
          price: priceFromModel(model, bounds[bounds.length - 1]),
        });
      } else if (skuLadders) {
        for (const ladder of skuLadders) {
          tiers.push({
            min: ladder.min_qty,
            max: ladder.max_qty,
            price: ladder.unit_price,
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, tiers }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
