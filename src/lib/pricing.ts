// ============================================================================
// PRICING ALGORITHMS - Pure functions for pricing calculations
// Extracted from Supabase edge function for client-side use and testing
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export interface PricingModel {
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

export interface Ladder {
  sku_id: string;
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
}

export interface TimePhase {
  start: number;
  end: number;
  totalQty: number;
  items: { pkgId: string; qty: number; term: number }[];
}

export interface PhasePrice {
  unitPrice: number;
  duration: number;
  totalQty: number;
}

export interface WeightedPriceData {
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

export interface PackageItem {
  pkgId: string;
  sku: string;
  quantity: number;
  termMonths: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ============================================================================
// TERM FACTOR CALCULATION (with interpolation)
// ============================================================================

export function interpolateTermFactor(
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

// ============================================================================
// GEOMETRIC BOUNDS FOR STEPPED PRICING
// ============================================================================

export function geometricBounds(baseQty: number, maxQty: number, steps: number): number[] {
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

export function boundsFromModel(model: PricingModel): number[] {
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

// ============================================================================
// PRICE CALCULATION FROM MODEL
// ============================================================================

export function priceFromModel(model: PricingModel, qty: number): number {
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

export function priceFromLadders(ladders: Ladder[], qty: number): number {
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
// TIME-PHASED AGGREGATION
// ============================================================================

/**
 * Calculate time-phased quantities across all packages.
 * Phases are determined by unique contract end points.
 */
export function calculateTimePhaseQuantities(
  items: PackageItem[]
): Map<string, Map<string, TimePhase>> {
  const skuPhases = new Map<string, Map<string, TimePhase>>();

  // Collect all unique term end points
  const termEndPoints = new Set<number>();
  termEndPoints.add(1); // Start at month 1

  for (const item of items) {
    termEndPoints.add(item.termMonths + 1);
  }

  // Sort term points
  const sortedTerms = Array.from(termEndPoints).sort((a, b) => a - b);

  // For each item, calculate quantities in each time period
  for (const item of items) {
    const sku = item.sku;
    const qty = item.quantity;
    const term = item.termMonths;

    if (!skuPhases.has(sku)) {
      skuPhases.set(sku, new Map());
    }

    const phases = skuPhases.get(sku)!;

    // Track this item's contribution to each phase
    for (let i = 0; i < sortedTerms.length - 1; i++) {
      const phaseStart = sortedTerms[i];
      const phaseEnd = sortedTerms[i + 1] - 1; // End is inclusive

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
          pkgId: item.pkgId,
          qty: qty,
          term: term,
        });
      }
    }
  }

  return skuPhases;
}

/**
 * Calculate weighted-average unit prices for each SKU/package combination.
 */
export function calculateTimeWeightedPrices(
  timePhaseData: Map<string, Map<string, TimePhase>>,
  findUnitPrice: (sku: string, qty: number) => number
): Map<string, Map<string, WeightedPriceData>> {
  const weightedPrices = new Map<string, Map<string, WeightedPriceData>>();

  for (const [sku, phases] of timePhaseData) {
    weightedPrices.set(sku, new Map());
    const skuPrices = weightedPrices.get(sku)!;

    // Calculate unit price for each phase based on total quantity
    const phasePrices = new Map<string, PhasePrice>();

    for (const [phaseKey, phaseInfo] of phases) {
      try {
        const unitPrice = findUnitPrice(sku, phaseInfo.totalQty);
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
        const key = `${item.pkgId}_${sku}`;

        if (!skuPrices.has(key)) {
          skuPrices.set(key, {
            pkgId: item.pkgId,
            weightedPrice: 0,
            totalWeight: 0,
            phasesList: [],
          });
        }

        const data = skuPrices.get(key)!;

        const phaseStart = phaseInfo.start;
        const phaseEnd = Math.min(phaseInfo.end, item.term);
        const phaseDuration = phaseEnd - phaseStart + 1;

        if (phaseDuration > 0 && phasePrices.has(phaseKey)) {
          const priceData = phasePrices.get(phaseKey)!;
          const weight = phaseDuration;
          const price = priceData.unitPrice;

          data.weightedPrice += price * weight;
          data.totalWeight += weight;

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

// ============================================================================
// BASE/USAGE RATIO FOR CAS PRICING
// ============================================================================

// Reference ratio at which DB prices were seeded (60% base / 40% usage)
export const CAS_REFERENCE_BASE_RATIO = 0.60;
export const CAS_REFERENCE_USAGE_RATIO = 0.40;

/**
 * Calculate the multiplier for base charge SKUs given a base/usage ratio.
 * At R=0.60 (reference), returns 1.0 (no change).
 */
export function calculateBaseRatioFactor(ratio: number): number {
  return round4(ratio / CAS_REFERENCE_BASE_RATIO);
}

/**
 * Calculate the multiplier for usage SKUs given a base/usage ratio.
 * At R=0.60 (reference), returns 1.0 (no change).
 */
export function calculateUsageRatioFactor(ratio: number): number {
  return round4((1 - ratio) / CAS_REFERENCE_USAGE_RATIO);
}

/**
 * Apply the base/usage ratio to a price. Only affects CAS category SKUs.
 * Returns the adjusted price and the ratio factor applied (null for non-CAS).
 */
export function applyBaseUsageRatio(
  price: number,
  isBaseCharge: boolean,
  category: string,
  ratio: number
): { adjustedPrice: number; ratioFactor: number | null } {
  if (category !== 'cas') {
    return { adjustedPrice: price, ratioFactor: null };
  }

  const factor = isBaseCharge
    ? calculateBaseRatioFactor(ratio)
    : calculateUsageRatioFactor(ratio);

  return {
    adjustedPrice: round4(price * factor),
    ratioFactor: factor,
  };
}
