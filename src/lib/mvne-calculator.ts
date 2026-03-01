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

/** Known platform usage SKU codes */
export const MVNE_USAGE_SKUS = [
  'Cennso_Sites',
  'Cennso_vCores',
  'Cennso_CoreCluster',
  'SMC_sessions',
  'UPG_Bandwidth',
  'TPOSS_UDR',
  'TPOSS_PCS',
  'TPOSS_CCS',
  'CNO_Sites',
  'CNO_Nodes',
  'CNO_DB',
  'CNO_LACS_Portal',
  'CNO_LACS_AAA',
  'CNO_LACS_Gateway',
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
  CNO_LACS_Portal: 'CNO LACS-Portal',
  CNO_LACS_AAA: 'CNO LACS-AAA',
  CNO_LACS_Gateway: 'CNO LACS-Gateway',
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

export type ComponentType = 'base' | 'usage' | 'external_fixed' | 'external_per_gb';

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
}

export interface MvneCalculationResult {
  /** Sum of all base charges */
  totalBaseCharges: number;
  /** Sum of all usage-based costs */
  totalUsageCosts: number;
  /** Total platform cost (base + usage) */
  totalPlatformCost: number;
  /** Total external fixed costs (split across MVNOs) */
  totalExternalFixed: number;
  /** Total external per-GB costs (sum of per_gb rates) */
  totalExternalPerGb: number;
  /** Total external costs (fixed + per-GB estimated) */
  totalExternalCost: number;
  /** Total fixed pool = platform + external fixed (split across MVNOs) */
  totalFixedPool: number;
  /** Grand total shared cost (platform + external) */
  totalSharedCost: number;
  /** Per-MVNO monthly recurring charge (fixed costs only / N) */
  perMvnoMrc: number;
  /** Per-GB rate = sum of all per-GB external costs */
  perGbRate: number;
  /** Estimated total monthly GB from aggregate throughput */
  totalMonthlyGb: number;
  /** Number of MVNOs used in the calculation */
  numMvnos: number;
  /** Line-item breakdown of every cost component */
  componentBreakdown: ComponentBreakdown[];
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
  const { num_mvnos, aggregate_throughput_mbps } = capacityInputs;
  const breakdown: ComponentBreakdown[] = [];

  // ------------------------------------------------------------------
  // 1. Usage SKU costs: quantity * unit_price * (1 - discount%)
  // ------------------------------------------------------------------
  let totalUsageCosts = 0;

  for (const skuCode of MVNE_USAGE_SKUS) {
    const qty = skuQuantities[skuCode] ?? 0;
    const model = skuPricingModels[skuCode];
    const listPrice = model?.base_unit_price ?? 0;
    const unitPrice = model && qty > 0 ? priceFromModel(model, qty) : listPrice;
    const discountPct = Math.min(100, Math.max(0, skuDiscounts[skuCode] ?? 0));
    const cost = round2(qty * unitPrice * (1 - discountPct / 100));

    totalUsageCosts += cost;

    breakdown.push({
      skuCode,
      label: SKU_LABELS[skuCode] ?? skuCode,
      type: 'usage',
      quantity: qty,
      listPrice,
      unitPrice,
      discountPct,
      cost,
    });
  }

  totalUsageCosts = round2(totalUsageCosts);

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
  // ------------------------------------------------------------------
  const totalFixedPool = round2(totalPlatformCost + totalExternalFixed);
  const totalSharedCost = round2(totalFixedPool + totalExternalPerGb * totalMonthlyGb);

  const effectiveMvnos = Math.max(1, num_mvnos);
  const perMvnoMrc = round2(totalFixedPool / effectiveMvnos);

  // ------------------------------------------------------------------
  // 7. Per-GB rate = sum of per-GB costs (constant across MVNO counts)
  // ------------------------------------------------------------------
  const perGbRate = round4(totalExternalPerGb);

  // ------------------------------------------------------------------
  // 8. Sensitivity table
  // ------------------------------------------------------------------
  const sensitivityTable = buildSensitivityTable(
    totalFixedPool,
    totalExternalPerGb,
  );

  return {
    totalBaseCharges,
    totalUsageCosts,
    totalPlatformCost,
    totalExternalFixed,
    totalExternalPerGb,
    totalExternalCost,
    totalFixedPool,
    totalSharedCost,
    perMvnoMrc,
    perGbRate,
    totalMonthlyGb,
    numMvnos: effectiveMvnos,
    componentBreakdown: breakdown,
    sensitivityTable,
  };
}

// ============================================================================
// SENSITIVITY ANALYSIS
// ============================================================================

/**
 * Build a sensitivity table showing per-MVNO MRC and per-GB rate
 * for a range of MVNO counts.
 *
 * Per-GB rate is constant (doesn't depend on N).
 * Per-MVNO MRC = totalFixedPool / N.
 */
export function buildSensitivityTable(
  totalFixedPool: number,
  totalExternalPerGb: number,
  mvnoCounts: readonly number[] = SENSITIVITY_MVNO_COUNTS,
): SensitivityRow[] {
  return mvnoCounts.map((n) => {
    const effectiveN = Math.max(1, n);
    return {
      numMvnos: effectiveN,
      perMvnoMrc: round2(totalFixedPool / effectiveN),
      perGbRate: round4(totalExternalPerGb),
    };
  });
}
