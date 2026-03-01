// ============================================================================
// MVNE PRICING CALCULATOR — Pure functions for MVNE shared-cost pricing
// Splits shared infrastructure costs equally across N MVNOs
// ============================================================================

import type { MvneCapacityInputs, MvneExternalCosts, MvneExternalCostItem } from '@/types/database';
import { round2, round4, priceFromModel } from '@/lib/pricing';
import type { PricingModel } from '@/lib/pricing';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Seconds in a 30-day month */
const SECONDS_PER_MONTH = 86_400 * 30;

/** Default MVNO counts for sensitivity analysis */
const SENSITIVITY_MVNO_COUNTS = [3, 5, 7, 10, 15] as const;

/** Shared infrastructure usage SKUs — costs split across N MVNOs */
export const MVNE_SHARED_USAGE_SKUS = [
  'Cennso_Sites',
  'Cennso_vCores',
  'Cennso_CoreCluster',
  'CNO_Sites',
  'CNO_Nodes',
  'CNO_DB',
] as const;

/** Per-MVNO usage SKUs — costs apply per single MVNO, not split */
export const MVNE_PER_MVNO_USAGE_SKUS = [
  'SMC_sessions',
  'UPG_Bandwidth',
  'TPOSS_UDR',
  'TPOSS_PCS',
  'TPOSS_CCS',
] as const;

/** Known platform usage SKU codes (union of shared + per-MVNO) */
export const MVNE_USAGE_SKUS = [
  ...MVNE_SHARED_USAGE_SKUS,
  ...MVNE_PER_MVNO_USAGE_SKUS,
] as const;

/** Known platform base charge SKU codes */
export const MVNE_BASE_SKUS = [
  'Cennso_base',
  'SMC_base',
  'UPG_base',
  'TPOSS_base',
  'CNO_base',
  'CNO_24_7',
  'CNO_central',
] as const;

/** Human-readable labels for SKU codes */
const SKU_LABELS: Record<string, string> = {
  Cennso_Sites: 'Cennso Sites',
  Cennso_vCores: 'Cennso vCores',
  Cennso_CoreCluster: 'Cennso Core Cluster',
  SMC_sessions: 'SMC Sessions',
  UPG_Bandwidth: 'UPG Bandwidth (Mbit/s)',
  TPOSS_UDR: 'TPOSS UDR',
  TPOSS_PCS: 'TPOSS PCS',
  TPOSS_CCS: 'TPOSS CCS',
  CNO_Sites: 'CNO Sites',
  CNO_Nodes: 'CNO Worker Nodes',
  CNO_DB: 'CNO Database Instances',
  Cennso_base: 'Cennso Base',
  SMC_base: 'SMC Base',
  UPG_base: 'UPG Base',
  TPOSS_base: 'TPOSS Base',
  CNO_base: 'CNO Management Base',
  CNO_24_7: 'CNO 24/7 Support',
  CNO_central: 'CNO Central Services',
};

// ============================================================================
// TYPES
// ============================================================================

export type ComponentType = 'base' | 'shared_usage' | 'per_mvno_usage' | 'external_fixed' | 'external_per_gb';

export interface ComponentBreakdown {
  skuCode: string;
  label: string;
  type: ComponentType;
  quantity?: number;
  listPrice?: number;
  unitPrice?: number;
  discountPct: number;
  cost: number;
}

export interface SensitivityRow {
  numMvnos: number;
  perMvnoMrc: number;
  perGbRate: number;
  costPerProducedGb: number;
}

export interface MvneCalculationResult {
  /** Sum of all base charges */
  totalBaseCharges: number;
  /** Sum of all usage-based costs (shared + per-MVNO combined) */
  totalUsageCosts: number;
  /** Sum of shared usage SKU costs (split across MVNOs) */
  totalSharedUsageCosts: number;
  /** Sum of per-MVNO usage SKU costs (not split) */
  totalPerMvnoUsageCosts: number;
  /** Total platform cost (base + usage) */
  totalPlatformCost: number;
  /** Total external fixed costs (split across MVNOs) */
  totalExternalFixed: number;
  /** Total external per-GB costs (sum of per_gb rates) */
  totalExternalPerGb: number;
  /** Total external costs (fixed + per-GB estimated) */
  totalExternalCost: number;
  /** Total fixed pool = base + shared usage + external fixed (split across MVNOs) */
  totalFixedPool: number;
  /** True total platform cost = fixedPool + (perMvnoUsage × N) + (perGb × totalGb) */
  totalSharedCost: number;
  /** Per-MVNO monthly recurring charge = fixedPool / N (fixed costs only) */
  perMvnoMrc: number;
  /** Blended per-GB rate = (perMvnoUsageCosts / estimatedGbPerMvno) + externalPerGb */
  perGbRate: number;
  /** Estimated total monthly GB from aggregate throughput */
  totalMonthlyGb: number;
  /** Estimated monthly GB per MVNO = totalMonthlyGb / N */
  estimatedGbPerMvno: number;
  /** Number of MVNOs used in the calculation */
  numMvnos: number;
  /** Line-item breakdown of every cost component */
  componentBreakdown: ComponentBreakdown[];
  /** All-in cost per produced GB = (perMvnoMrc + perGbRate × estimatedGb) / estimatedGb */
  costPerProducedGb: number;
  /** Sensitivity table showing per-MVNO costs at various MVNO counts */
  sensitivityTable: SensitivityRow[];
}

// ============================================================================
// MIGRATION & DEFAULTS
// ============================================================================

let _nextId = 1;
function nextId(): string {
  return `ext_${_nextId++}`;
}

/**
 * Create the 3 default external cost items.
 */
export function createDefaultExternalCosts(): MvneExternalCosts {
  return [
    { id: nextId(), name: 'Infrastructure (VMs, IPs, Storage)', fixed_monthly: 0, per_gb: 0 },
    { id: nextId(), name: 'GRX Costs', fixed_monthly: 0, per_gb: 0 },
    { id: nextId(), name: 'eSIM Costs', fixed_monthly: 0, per_gb: 0 },
  ];
}

/**
 * Migrate old-format external costs ({ infrastructure, grx, esim })
 * to the new array format. If already an array, returns as-is.
 */
export function migrateExternalCosts(raw: unknown): MvneExternalCosts {
  if (Array.isArray(raw)) {
    // Already new format — ensure each item has an id
    return (raw as MvneExternalCostItem[]).map((item) => ({
      ...item,
      id: item.id || nextId(),
    }));
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const old = raw as { infrastructure?: number; grx?: number; esim?: number };
    return [
      { id: nextId(), name: 'Infrastructure (VMs, IPs, Storage)', fixed_monthly: old.infrastructure ?? 0, per_gb: 0 },
      { id: nextId(), name: 'GRX Costs', fixed_monthly: old.grx ?? 0, per_gb: 0 },
      { id: nextId(), name: 'eSIM Costs', fixed_monthly: old.esim ?? 0, per_gb: 0 },
    ];
  }

  return createDefaultExternalCosts();
}

// ============================================================================
// THROUGHPUT CONVERSION
// ============================================================================

/**
 * Convert aggregate throughput in Mbit/s to estimated monthly GB.
 *
 * Formula:
 *   Mbit/s -> MB/s (/ 8) -> GB/s (/ 1024) -> GB/month (* 86400 * 30)
 *
 * Uses 30-day month, binary GB (1024 MB = 1 GB).
 */
export function throughputToMonthlyGb(throughputMbps: number): number {
  if (throughputMbps <= 0) return 0;
  return round4((throughputMbps / 8 / 1024) * SECONDS_PER_MONTH);
}

// ============================================================================
// AUTO-POPULATION FROM CAPACITY INPUTS
// ============================================================================

/**
 * Compute auto-populated SKU quantities from capacity inputs.
 * Returns quantities for all SKUs that have formulas (excludes CNO_DB which is manual).
 */
export function computeSkuQuantities(capacity: MvneCapacityInputs): Record<string, number> {
  const cennsoCnoSites = capacity.num_grx_sites + capacity.num_local_breakouts + 1;

  return {
    Cennso_Sites: cennsoCnoSites,
    Cennso_vCores: (capacity.vcores_per_breakout * capacity.num_local_breakouts) + (capacity.vcores_per_pgw * capacity.num_grx_sites),
    Cennso_CoreCluster: capacity.num_grx_sites + capacity.num_local_breakouts,
    CNO_Sites: cennsoCnoSites,
    CNO_Nodes: capacity.nodes_per_cno_site * cennsoCnoSites,
    SMC_sessions: capacity.subs_per_mvno * capacity.parallel_take_rate,
    UPG_Bandwidth: capacity.aggregate_throughput_mbps / Math.max(1, capacity.num_mvnos),
    TPOSS_UDR: capacity.subs_per_mvno,
    TPOSS_PCS: capacity.subs_per_mvno * capacity.take_rate_pcs_udr,
    TPOSS_CCS: capacity.subs_per_mvno * capacity.take_rate_ccs_udr,
  };
}

/** SKU codes that can be auto-populated from capacity inputs */
export const AUTO_POPULATED_SKUS = new Set(Object.keys(computeSkuQuantities({
  num_mvnos: 0, subs_per_mvno: 0, parallel_take_rate: 0,
  aggregate_throughput_mbps: 0, num_local_breakouts: 0,
  breakout_capacity_mbps: 0, num_grx_sites: 0, apns_per_mvno: 0,
  vcores_per_breakout: 0, vcores_per_pgw: 0,
  take_rate_pcs_udr: 0, take_rate_ccs_udr: 0, nodes_per_cno_site: 0,
  gb_per_sub_per_month: 0,
})));

// ============================================================================
// CORE CALCULATION
// ============================================================================

/**
 * Calculate the full MVNE cost breakdown for a given set of inputs.
 *
 * New model:
 *   - Fixed costs (platform + external fixed) are split across N MVNOs -> perMvnoMrc
 *   - Per-GB costs are summed directly -> perGbRate (constant regardless of N)
 */
export function calculateMvnePricing(
  skuQuantities: Record<string, number>,
  skuPricingModels: Record<string, PricingModel>,
  baseCharges: Record<string, number>,
  externalCosts: MvneExternalCosts,
  capacityInputs: MvneCapacityInputs,
  skuDiscounts: Record<string, number> = {},
): MvneCalculationResult {
  const { num_mvnos, aggregate_throughput_mbps, subs_per_mvno, gb_per_sub_per_month } = capacityInputs;
  const breakdown: ComponentBreakdown[] = [];

  // ------------------------------------------------------------------
  // 1. Usage SKU costs: quantity * unit_price * (1 - discount%)
  //    Split into shared (infrastructure, split across N) and per-MVNO
  // ------------------------------------------------------------------
  let totalSharedUsageCosts = 0;
  let totalPerMvnoUsageCosts = 0;

  const sharedSet = new Set<string>(MVNE_SHARED_USAGE_SKUS);

  for (const skuCode of MVNE_USAGE_SKUS) {
    const qty = skuQuantities[skuCode] ?? 0;
    const model = skuPricingModels[skuCode];
    const listPrice = model?.base_unit_price ?? 0;
    const unitPrice = model && qty > 0 ? priceFromModel(model, qty) : listPrice;
    const discountPct = Math.min(100, Math.max(0, skuDiscounts[skuCode] ?? 0));
    const cost = round2(qty * unitPrice * (1 - discountPct / 100));

    const isShared = sharedSet.has(skuCode);
    if (isShared) {
      totalSharedUsageCosts += cost;
    } else {
      totalPerMvnoUsageCosts += cost;
    }

    breakdown.push({
      skuCode,
      label: SKU_LABELS[skuCode] ?? skuCode,
      type: isShared ? 'shared_usage' : 'per_mvno_usage',
      quantity: qty,
      listPrice,
      unitPrice,
      discountPct,
      cost,
    });
  }

  totalSharedUsageCosts = round2(totalSharedUsageCosts);
  totalPerMvnoUsageCosts = round2(totalPerMvnoUsageCosts);
  const totalUsageCosts = round2(totalSharedUsageCosts + totalPerMvnoUsageCosts);

  // ------------------------------------------------------------------
  // 2. Base charges: fixed MRC * (1 - discount%)
  // ------------------------------------------------------------------
  let totalBaseCharges = 0;

  for (const skuCode of MVNE_BASE_SKUS) {
    const baseMrc = baseCharges[skuCode] ?? 0;
    const discountPct = Math.min(100, Math.max(0, skuDiscounts[skuCode] ?? 0));
    const cost = round2(baseMrc * (1 - discountPct / 100));
    totalBaseCharges += cost;

    breakdown.push({
      skuCode,
      label: SKU_LABELS[skuCode] ?? skuCode,
      type: 'base',
      discountPct,
      cost,
    });
  }

  totalBaseCharges = round2(totalBaseCharges);

  // ------------------------------------------------------------------
  // 3. Platform total
  // ------------------------------------------------------------------
  const totalPlatformCost = round2(totalBaseCharges + totalUsageCosts);

  // ------------------------------------------------------------------
  // 4. Monthly GB (needed for per-GB cost estimation)
  // ------------------------------------------------------------------
  const totalMonthlyGb = throughputToMonthlyGb(aggregate_throughput_mbps);

  // ------------------------------------------------------------------
  // 5. External costs: iterate array, split fixed vs per-GB
  // ------------------------------------------------------------------
  let totalExternalFixed = 0;
  let totalExternalPerGb = 0;

  for (const item of externalCosts) {
    const fixedCost = round2(item.fixed_monthly);
    const perGbCost = round4(item.per_gb);

    if (fixedCost > 0) {
      totalExternalFixed += fixedCost;
      breakdown.push({
        skuCode: `EXT_fixed_${item.id}`,
        label: item.name,
        type: 'external_fixed',
        discountPct: 0,
        cost: fixedCost,
      });
    }

    if (perGbCost > 0) {
      totalExternalPerGb = round4(totalExternalPerGb + perGbCost);
      breakdown.push({
        skuCode: `EXT_pergb_${item.id}`,
        label: item.name,
        type: 'external_per_gb',
        discountPct: 0,
        unitPrice: perGbCost,
        cost: round2(perGbCost * totalMonthlyGb),
      });
    }
  }

  totalExternalFixed = round2(totalExternalFixed);
  const totalExternalCost = round2(totalExternalFixed + totalExternalPerGb * totalMonthlyGb);

  // ------------------------------------------------------------------
  // 6. Fixed pool and per-MVNO split
  //    sharedPool = base + shared usage + external fixed  (split by N)
  //    perMvnoMrc = sharedPool / N                        (fixed costs only)
  // ------------------------------------------------------------------
  const totalFixedPool = round2(totalBaseCharges + totalSharedUsageCosts + totalExternalFixed);
  const effectiveMvnos = Math.max(1, num_mvnos);
  const perMvnoMrc = round2(totalFixedPool / effectiveMvnos);

  // ------------------------------------------------------------------
  // 7. Blended per-GB rate
  //    Amortize per-MVNO usage costs over estimated GB per MVNO
  //    (subscriber-based: subs × gb_per_sub), then add external per-GB.
  // ------------------------------------------------------------------
  const estimatedGbPerMvno = round4(subs_per_mvno * gb_per_sub_per_month);
  const usageCostPerGb = estimatedGbPerMvno > 0 ? totalPerMvnoUsageCosts / estimatedGbPerMvno : 0;
  const perGbRate = round4(usageCostPerGb + totalExternalPerGb);

  // ------------------------------------------------------------------
  // 7b. Total platform cost (consistent scope: all costs × all MVNOs)
  // ------------------------------------------------------------------
  const totalEstimatedGb = round4(estimatedGbPerMvno * effectiveMvnos);
  const totalSharedCost = round2(totalFixedPool + (totalPerMvnoUsageCosts * effectiveMvnos) + (totalExternalPerGb * totalEstimatedGb));

  // ------------------------------------------------------------------
  // 8. All-in cost per produced GB (for slides / marketing)
  //    = total MVNO monthly cost / estimated GB
  // ------------------------------------------------------------------
  const totalMvnoMonthlyCost = perMvnoMrc + perGbRate * estimatedGbPerMvno;
  const costPerProducedGb = estimatedGbPerMvno > 0 ? round4(totalMvnoMonthlyCost / estimatedGbPerMvno) : 0;

  // ------------------------------------------------------------------
  // 9. Sensitivity table
  // ------------------------------------------------------------------
  const sensitivityTable = buildSensitivityTable(
    totalFixedPool,
    perGbRate,
    estimatedGbPerMvno,
  );

  return {
    totalBaseCharges,
    totalUsageCosts,
    totalSharedUsageCosts,
    totalPerMvnoUsageCosts,
    totalPlatformCost,
    totalExternalFixed,
    totalExternalPerGb,
    totalExternalCost,
    totalFixedPool,
    totalSharedCost,
    perMvnoMrc,
    perGbRate,
    totalMonthlyGb,
    estimatedGbPerMvno,
    numMvnos: effectiveMvnos,
    costPerProducedGb,
    componentBreakdown: breakdown,
    sensitivityTable,
  };
}

// ============================================================================
// SENSITIVITY ANALYSIS
// ============================================================================

/**
 * Build a sensitivity table showing per-MVNO MRC and blended per-GB rate
 * for a range of MVNO counts.
 *
 * Per-MVNO MRC = totalFixedPool / N (fixed costs only).
 * Per-GB rate is constant across N (subscriber-based estimate is per-MVNO).
 */
export function buildSensitivityTable(
  totalFixedPool: number,
  perGbRate: number,
  estimatedGbPerMvno: number,
  mvnoCounts: readonly number[] = SENSITIVITY_MVNO_COUNTS,
): SensitivityRow[] {
  return mvnoCounts.map((n) => {
    const effectiveN = Math.max(1, n);
    const mrc = round2(totalFixedPool / effectiveN);
    const totalMonthlyCost = mrc + perGbRate * estimatedGbPerMvno;
    return {
      numMvnos: effectiveN,
      perMvnoMrc: mrc,
      perGbRate,
      costPerProducedGb: estimatedGbPerMvno > 0 ? round4(totalMonthlyCost / estimatedGbPerMvno) : 0,
    };
  });
}
