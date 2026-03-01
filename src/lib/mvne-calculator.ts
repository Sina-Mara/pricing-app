// ============================================================================
// MVNE PRICING CALCULATOR — Pure functions for MVNE shared-cost pricing
// Splits shared infrastructure costs equally across N MVNOs
// ============================================================================

import type { MvneCapacityInputs, MvneExternalCosts } from '@/types/database';
import { round2, round4 } from '@/lib/pricing';

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
] as const;

/** Known platform base charge SKU codes */
export const MVNE_BASE_SKUS = [
  'Cennso_base',
  'SMC_base',
  'UPG_base',
  'TPOSS_base',
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
  Cennso_base: 'Cennso Base',
  SMC_base: 'SMC Base',
  UPG_base: 'UPG Base',
  TPOSS_base: 'TPOSS Base',
};

// ============================================================================
// TYPES
// ============================================================================

export type ComponentType = 'base' | 'usage' | 'external';

export interface ComponentBreakdown {
  skuCode: string;
  label: string;
  type: ComponentType;
  quantity?: number;
  unitPrice?: number;
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
  /** Total external costs (infrastructure + GRX + eSIM) */
  totalExternalCost: number;
  /** Grand total shared cost (platform + external) */
  totalSharedCost: number;
  /** Per-MVNO monthly recurring charge */
  perMvnoMrc: number;
  /** Cost per GB based on aggregate throughput */
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
// THROUGHPUT CONVERSION
// ============================================================================

/**
 * Convert aggregate throughput in Mbit/s to estimated monthly GB.
 *
 * Formula:
 *   Mbit/s → MB/s (÷ 8) → GB/s (÷ 1024) → GB/month (× 86400 × 30)
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
 * @param skuQuantities   - User-entered quantities keyed by usage SKU code
 * @param skuUnitPrices   - Unit prices from DB (pricing_models.base_unit_price)
 * @param baseCharges     - Fixed MRC values from DB (base_charges), keyed by SKU code
 * @param externalCosts   - Manual external cost entries (infrastructure, GRX, eSIM)
 * @param capacityInputs  - Capacity parameters; num_mvnos and aggregate_throughput_mbps are used
 */
export function calculateMvnePricing(
  skuQuantities: Record<string, number>,
  skuUnitPrices: Record<string, number>,
  baseCharges: Record<string, number>,
  externalCosts: MvneExternalCosts,
  capacityInputs: MvneCapacityInputs,
): MvneCalculationResult {
  const { num_mvnos, aggregate_throughput_mbps } = capacityInputs;
  const breakdown: ComponentBreakdown[] = [];

  // ------------------------------------------------------------------
  // 1. Usage SKU costs: quantity × unit_price
  // ------------------------------------------------------------------
  let totalUsageCosts = 0;

  for (const skuCode of MVNE_USAGE_SKUS) {
    const qty = skuQuantities[skuCode] ?? 0;
    const unitPrice = skuUnitPrices[skuCode] ?? 0;
    const cost = round2(qty * unitPrice);

    totalUsageCosts += cost;

    breakdown.push({
      skuCode,
      label: SKU_LABELS[skuCode] ?? skuCode,
      type: 'usage',
      quantity: qty,
      unitPrice,
      cost,
    });
  }

  totalUsageCosts = round2(totalUsageCosts);

  // ------------------------------------------------------------------
  // 2. Base charges: sum of fixed MRC values
  // ------------------------------------------------------------------
  let totalBaseCharges = 0;

  for (const skuCode of MVNE_BASE_SKUS) {
    const cost = round2(baseCharges[skuCode] ?? 0);
    totalBaseCharges += cost;

    breakdown.push({
      skuCode,
      label: SKU_LABELS[skuCode] ?? skuCode,
      type: 'base',
      cost,
    });
  }

  totalBaseCharges = round2(totalBaseCharges);

  // ------------------------------------------------------------------
  // 3. Platform total
  // ------------------------------------------------------------------
  const totalPlatformCost = round2(totalBaseCharges + totalUsageCosts);

  // ------------------------------------------------------------------
  // 4. External costs
  // ------------------------------------------------------------------
  const infraCost = round2(externalCosts.infrastructure);
  const grxCost = round2(externalCosts.grx);
  const esimCost = round2(externalCosts.esim);
  const totalExternalCost = round2(infraCost + grxCost + esimCost);

  breakdown.push(
    { skuCode: 'EXT_infrastructure', label: 'Infrastructure', type: 'external', cost: infraCost },
    { skuCode: 'EXT_grx', label: 'GRX', type: 'external', cost: grxCost },
    { skuCode: 'EXT_esim', label: 'eSIM', type: 'external', cost: esimCost },
  );

  // ------------------------------------------------------------------
  // 5. Grand total and per-MVNO split
  // ------------------------------------------------------------------
  const totalSharedCost = round2(totalPlatformCost + totalExternalCost);

  const effectiveMvnos = Math.max(1, num_mvnos);
  const perMvnoMrc = round2(totalSharedCost / effectiveMvnos);

  // ------------------------------------------------------------------
  // 6. Per-GB rate
  // ------------------------------------------------------------------
  const totalMonthlyGb = throughputToMonthlyGb(aggregate_throughput_mbps);
  const perGbRate = totalMonthlyGb > 0 ? round4(totalSharedCost / totalMonthlyGb) : 0;

  // ------------------------------------------------------------------
  // 7. Sensitivity table
  // ------------------------------------------------------------------
  const sensitivityTable = buildSensitivityTable(
    totalSharedCost,
    totalMonthlyGb,
  );

  return {
    totalBaseCharges,
    totalUsageCosts,
    totalPlatformCost,
    totalExternalCost,
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
 */
export function buildSensitivityTable(
  totalSharedCost: number,
  totalMonthlyGb: number,
  mvnoCounts: readonly number[] = SENSITIVITY_MVNO_COUNTS,
): SensitivityRow[] {
  return mvnoCounts.map((n) => {
    const effectiveN = Math.max(1, n);
    return {
      numMvnos: effectiveN,
      perMvnoMrc: round2(totalSharedCost / effectiveN),
      perGbRate: totalMonthlyGb > 0 ? round4(totalSharedCost / totalMonthlyGb) : 0,
    };
  });
}
