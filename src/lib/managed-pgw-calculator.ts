// ============================================================================
// MANAGED PGW SAAS PRICING CALCULATOR — SPEC-014
// Produces per-SAU/per-connection price schedule across 10 volume tiers
// for the Vodafone IoT Managed PGW RFP "SaaS Fees" tab.
// ============================================================================

import { round2, round4, priceFromModel, applyBaseUsageRatio, interpolateTermFactor, CAS_REFERENCE_BASE_RATIO } from '@/lib/pricing';
import type { PricingModel } from '@/lib/pricing';

export { CAS_REFERENCE_BASE_RATIO };
import type { ManagedPgwTopologyInputs, ManagedPgwExternalCostItem } from '@/types/database';

// ============================================================================
// CONSTANTS
// ============================================================================

const ANNUAL_EROSION_RATE = 0.06;
const CONTRACT_YEARS = 5;

/** Tier definitions from the Vodafone pricebook template (SAU max, throughput guardrail).
 *  Tier 10 maxSau is null — resolved from topology_inputs.tier10_sau_cap at runtime. */
export const MANAGED_PGW_TIERS = [
  { tier: 1,  label: '≤ 250k',        maxSau: 250_000,    throughputGbps: 30 },
  { tier: 2,  label: '250k – 500k',   maxSau: 500_000,    throughputGbps: 30 },
  { tier: 3,  label: '500k – 750k',   maxSau: 750_000,    throughputGbps: 30 },
  { tier: 4,  label: '750k – 1M',     maxSau: 1_000_000,  throughputGbps: 30 },
  { tier: 5,  label: '1M – 1.5M',     maxSau: 1_500_000,  throughputGbps: 45 },
  { tier: 6,  label: '1.5M – 2M',     maxSau: 2_000_000,  throughputGbps: 45 },
  { tier: 7,  label: '2M – 3M',       maxSau: 3_000_000,  throughputGbps: 45 },
  { tier: 8,  label: '3M – 4M',       maxSau: 4_000_000,  throughputGbps: 65 },
  { tier: 9,  label: '4M – 5M',       maxSau: 5_000_000,  throughputGbps: 65 },
  { tier: 10, label: '5M+',           maxSau: null,        throughputGbps: 65 },
] as const;

/** Fixed topology SKUs — quantities derived from deployment inputs, constant across tiers */
export const PGW_TOPOLOGY_SKUS = [
  'Cennso_Sites',
  'Cennso_vCores',
  'Cennso_CoreCluster',
  'CNO_Sites',
  'CNO_Nodes',
  'CNO_DB',
] as const;

/** Tier-variable SKUs — quantities change per tier */
export const PGW_TIER_SKUS = [
  'SMC_sessions',   // = SAU (concurrent attached connections)
  'UPG_Bandwidth',  // = tier peak throughput guardrail in Mbit/s
] as const;

/** Base charge SKUs — flat MRC regardless of tier */
export const PGW_BASE_SKUS = [
  'Cennso_base',
  'SMC_base',
  'UPG_base',
  'CCS_base',
  'CNO_base',
  'CNO_24_7',
  'CNO_central',
] as const;

/** SKUs whose cost is shared across CNS customers and must be allocated by share %. */
const SHARED_SKUS = new Set(['Cennso_base', 'CNO_base', 'CNO_24_7']);

const SKU_CATEGORIES: Record<string, 'cas' | 'cno' | 'ccs'> = {
  Cennso_Sites:       'cas',
  Cennso_vCores:      'cas',
  Cennso_CoreCluster: 'cas',
  SMC_sessions:       'cas',
  UPG_Bandwidth:      'cas',
  Cennso_base:        'cas',
  SMC_base:           'cas',
  UPG_base:           'cas',
  CCS_base:           'ccs',
  CNO_Sites:          'cno',
  CNO_Nodes:          'cno',
  CNO_DB:             'cno',
  CNO_base:           'cno',
  CNO_24_7:           'cno',
  CNO_central:        'cno',
};


const SKU_LABELS: Record<string, string> = {
  Cennso_Sites:      'Cennso Sites',
  Cennso_vCores:     'Cennso vCores',
  Cennso_CoreCluster:'Cennso Core Cluster',
  CNO_Sites:         'CNO Sites',
  CNO_Nodes:         'CNO Worker Nodes',
  CNO_DB:            'CNO Database Instances',
  SMC_sessions:      'SMC Sessions (SAU)',
  UPG_Bandwidth:     'UPG Bandwidth (Mbit/s)',
  Cennso_base:       'Cennso Base',
  SMC_base:          'SMC Base',
  UPG_base:          'UPG Base',
  CCS_base:          'CCS Base',
  CNO_base:          'CNO Management Base',
  CNO_24_7:          'CNO 24/7 Support',
  CNO_central:       'CNO Central Services',
};

// ============================================================================
// TYPES
// ============================================================================

export interface TierCostBreakdown {
  skuCode: string;
  label: string;
  type: 'topology' | 'tier_variable' | 'base' | 'external' | 'per_gb';
  quantity?: number;
  unitPrice?: number;
  cost: number;
  /** Only set for shared SKUs — cost before the customer share % is applied */
  fullCost?: number;
  /** Only set for shared SKUs — fraction applied (0–1) */
  sharePct?: number;
  isShared?: boolean;
}

export interface TierRow {
  tier: number;
  label: string;
  maxSau: number;
  throughputGbps: number;
  totalMonthlyCost: number;
  /** Per-SAU unit price for each contract year [Y1, Y2, Y3, Y4, Y5] */
  unitPrices: [number, number, number, number, number];
  breakdown: TierCostBreakdown[];
}

export interface ManagedPgwResult {
  tiers: TierRow[];
  /** Fixed topology SKU quantities (same for all tiers) */
  topologyQuantities: Record<string, number>;
}

// ============================================================================
// TOPOLOGY QUANTITIES
// ============================================================================

/** Derive fixed-topology SKU quantities from deployment inputs. */
export function computeTopologyQuantities(inputs: ManagedPgwTopologyInputs): Record<string, number> {
  return {
    Cennso_Sites:       inputs.num_sites,
    Cennso_vCores:      inputs.vcores_per_site * inputs.num_sites,
    Cennso_CoreCluster: inputs.num_sites,
    CNO_Sites:          inputs.num_sites,
    CNO_Nodes:          inputs.nodes_per_cno_site * inputs.num_sites,
    CNO_DB:             inputs.cno_db_instances,
  };
}

/** Migrate saved configs that used the old num_local_breakouts/num_grx_sites fields. */
export function migrateTopologyInputs(raw: Record<string, unknown>): ManagedPgwTopologyInputs {
  if ('num_local_breakouts' in raw || 'num_grx_sites' in raw) {
    const breakouts = (raw.num_local_breakouts as number) ?? 0;
    const grxSites  = (raw.num_grx_sites as number) ?? 0;
    const oldTotalSites = breakouts + grxSites + 1;
    const totalVCores   = ((raw.vcores_per_breakout as number) ?? 0) * breakouts
                        + ((raw.vcores_per_pgw      as number) ?? 0) * grxSites;
    const activeSites   = Math.max(breakouts + grxSites, 1);
    return {
      num_sites:         oldTotalSites,
      vcores_per_site:   Math.round(totalVCores / activeSites),
      nodes_per_cno_site:(raw.nodes_per_cno_site as number) ?? 3,
      cno_db_instances:  (raw.cno_db_instances  as number) ?? 3,
      tier10_sau_cap:    (raw.tier10_sau_cap     as number) ?? 7_500_000,
      cas_ratio:            (raw.cas_ratio            as number) ?? CAS_REFERENCE_BASE_RATIO,
      commitment_months:    (raw.commitment_months    as number) ?? 12,
      gb_per_sau_per_month: (raw.gb_per_sau_per_month as number) ?? 0,
      rp_value:             (raw.rp_value             as number) ?? 0,
    };
  }
  const r = raw as Record<string, unknown>;
  return {
    num_sites:            (r.num_sites            as number) ?? 8,
    vcores_per_site:      (r.vcores_per_site      as number) ?? 18,
    nodes_per_cno_site:   (r.nodes_per_cno_site   as number) ?? 3,
    cno_db_instances:     (r.cno_db_instances     as number) ?? 3,
    tier10_sau_cap:       (r.tier10_sau_cap        as number) ?? 7_500_000,
    cas_ratio:            (r.cas_ratio             as number) ?? CAS_REFERENCE_BASE_RATIO,
    commitment_months:    (r.commitment_months     as number) ?? 12,
    gb_per_sau_per_month: (r.gb_per_sau_per_month  as number) ?? 0,
    rp_value:             (r.rp_value              as number) ?? 0,
  };
}

// ============================================================================
// CORE CALCULATION
// ============================================================================

/**
 * Calculate the 10-tier per-SAU SaaS price table for a Managed PGW service.
 *
 * For each tier:
 *   1. Set SMC_sessions = tier max SAU, UPG_Bandwidth = tier throughput in Mbit/s
 *   2. Price all SKUs (topology + tier-variable + base charges + external infra)
 *   3. totalMonthlyCost / maxSau = Y1 unit price
 *   4. Apply 6% compound annual erosion for Y2–Y5
 */
const CCS_MAINTENANCE_RATE = 0.10 / 12; // 10% p.a. → monthly

export function calculateManagedPgwTiers(
  topologyInputs: ManagedPgwTopologyInputs,
  skuPricingModels: Record<string, PricingModel>,
  baseCharges: Record<string, number>,
  externalCosts: ManagedPgwExternalCostItem[],
  termFactors: Record<string, Map<number, number>> = {},
  customerSharePct: number = 1,
): ManagedPgwResult {
  const topologyQuantities = computeTopologyQuantities(topologyInputs);

  const casRatio        = topologyInputs.cas_ratio ?? CAS_REFERENCE_BASE_RATIO;
  const commitmentMonths = topologyInputs.commitment_months ?? 12;
  const gbPerSauPerMonth = topologyInputs.gb_per_sau_per_month ?? 0;
  const rpValue          = topologyInputs.rp_value ?? 0;

  // CCS base: RP value × 10% p.a. / 12, overrides catalog value
  const ccsBaseCost = round2(rpValue * CCS_MAINTENANCE_RATE);

  // External: separate fixed and per-GB components
  const totalExternalFixed = round2(externalCosts.reduce((s, i) => s + (i.fixed_monthly ?? 0), 0));
  const totalExternalPerGb = round4(externalCosts.reduce((s, i) => s + (i.per_gb ?? 0), 0));

  const getTermFactor = (skuCode: string): number => {
    const cat = SKU_CATEGORIES[skuCode];
    const map = cat ? termFactors[cat] : undefined;
    return map ? interpolateTermFactor(map, commitmentMonths, cat!) : 1;
  };

  const tiers: TierRow[] = MANAGED_PGW_TIERS.map((tierDef) => {
    const maxSau = tierDef.maxSau ?? topologyInputs.tier10_sau_cap;
    const throughputMbps = tierDef.throughputGbps * 1000;

    const breakdown: TierCostBreakdown[] = [];
    let totalUsageCost = 0;

    // Topology SKUs (fixed across tiers)
    for (const skuCode of PGW_TOPOLOGY_SKUS) {
      const qty = topologyQuantities[skuCode] ?? 0;
      const model = skuPricingModels[skuCode];
      const rawPrice = model && qty > 0 ? priceFromModel(model, qty) : (model?.base_unit_price ?? 0);
      const { adjustedPrice: ratioPrice } = applyBaseUsageRatio(rawPrice, false, SKU_CATEGORIES[skuCode] ?? 'default', casRatio);
      const unitPrice = round4(ratioPrice * getTermFactor(skuCode));
      const cost = round2(qty * unitPrice);
      totalUsageCost += cost;
      breakdown.push({ skuCode, label: SKU_LABELS[skuCode] ?? skuCode, type: 'topology', quantity: qty, unitPrice, cost });
    }

    // Tier-variable SKUs
    const tierVariableQtys: Record<string, number> = {
      SMC_sessions:  maxSau,
      UPG_Bandwidth: throughputMbps,
    };
    for (const skuCode of PGW_TIER_SKUS) {
      const qty = tierVariableQtys[skuCode] ?? 0;
      const model = skuPricingModels[skuCode];
      const rawPrice = model && qty > 0 ? priceFromModel(model, qty) : (model?.base_unit_price ?? 0);
      const { adjustedPrice: ratioPrice } = applyBaseUsageRatio(rawPrice, false, SKU_CATEGORIES[skuCode] ?? 'default', casRatio);
      const unitPrice = round4(ratioPrice * getTermFactor(skuCode));
      const cost = round2(qty * unitPrice);
      totalUsageCost += cost;
      breakdown.push({ skuCode, label: SKU_LABELS[skuCode] ?? skuCode, type: 'tier_variable', quantity: qty, unitPrice, cost });
    }

    // Base charges
    let totalBaseCharges = 0;
    for (const skuCode of PGW_BASE_SKUS) {
      // CCS_base is driven by RP value, not the catalog
      const rawCost = skuCode === 'CCS_base' ? ccsBaseCost : (baseCharges[skuCode] ?? 0);
      const { adjustedPrice: ratioAdjusted } = applyBaseUsageRatio(rawCost, true, SKU_CATEGORIES[skuCode] ?? 'default', casRatio);
      const fullCost = round2(ratioAdjusted * getTermFactor(skuCode));
      const isShared = SHARED_SKUS.has(skuCode);
      const cost = isShared ? round2(fullCost * customerSharePct) : fullCost;
      totalBaseCharges += cost;
      if (fullCost > 0) {
        breakdown.push({
          skuCode,
          label: SKU_LABELS[skuCode] ?? skuCode,
          type: 'base',
          cost,
          ...(isShared ? { isShared: true, fullCost, sharePct: customerSharePct } : {}),
        });
      }
    }

    // External infra — fixed portion
    for (const item of externalCosts) {
      const cost = round2(item.fixed_monthly ?? 0);
      if (cost > 0) {
        breakdown.push({ skuCode: `EXT_${item.id}`, label: item.name, type: 'external', cost });
      }
    }

    // Per-GB costs blended into per-SAU
    const estimatedGb = round4(maxSau * gbPerSauPerMonth);
    const perGbCost   = round2(estimatedGb * totalExternalPerGb);
    if (perGbCost > 0) {
      breakdown.push({
        skuCode: 'PER_GB',
        label: `Per-GB costs (${gbPerSauPerMonth} GB/SAU/mo × ${maxSau.toLocaleString()} SAU)`,
        type: 'per_gb',
        quantity: estimatedGb,
        unitPrice: totalExternalPerGb,
        cost: perGbCost,
      });
    }

    const totalMonthlyCost = round2(totalUsageCost + totalBaseCharges + totalExternalFixed + perGbCost);
    const unitPriceY1 = maxSau > 0 ? round4(totalMonthlyCost / maxSau) : 0;

    const unitPrices = Array.from({ length: CONTRACT_YEARS }, (_, i) =>
      round4(unitPriceY1 * Math.pow(1 - ANNUAL_EROSION_RATE, i))
    ) as [number, number, number, number, number];

    return {
      tier: tierDef.tier,
      label: tierDef.label,
      maxSau,
      throughputGbps: tierDef.throughputGbps,
      totalMonthlyCost,
      unitPrices,
      breakdown,
    };
  });

  return { tiers, topologyQuantities };
}

// ============================================================================
// DEFAULT INPUTS
// ============================================================================

export function createDefaultTopologyInputs(): ManagedPgwTopologyInputs {
  // num_sites=8, vcores_per_site=18 matches old defaults:
  //   sites = 5 breakouts + 2 GRX + 1 = 8
  //   vCores = 16×5 + 32×2 = 144 = 18×8
  return {
    num_sites: 8,
    vcores_per_site: 18,
    nodes_per_cno_site: 3,
    cno_db_instances: 3,
    tier10_sau_cap: 7_500_000,
    cas_ratio: CAS_REFERENCE_BASE_RATIO,
    commitment_months: 12,
    gb_per_sau_per_month: 0,
    rp_value: 0,
  };
}

export function createDefaultExternalCosts(): ManagedPgwExternalCostItem[] {
  return [
    { id: 'ext_1', name: 'Infrastructure (VMs, IPs, Storage)', fixed_monthly: 0, per_gb: 0 },
    { id: 'ext_2', name: 'Connectivity / Transit', fixed_monthly: 0, per_gb: 0 },
  ];
}
