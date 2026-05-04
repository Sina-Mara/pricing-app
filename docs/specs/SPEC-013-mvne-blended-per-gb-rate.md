# SPEC-013: MVNE Calculator — Blended Per-GB Usage Rate

**Status:** decomposed
**Created:** 2026-03-01

## Problem

The MVNE Calculator outputs two prices per MVNO customer: a base MRC and a per-GB rate. Currently, per-MVNO usage SKU costs (SMC sessions, UPG bandwidth, TPOSS records) are added as a fixed lump sum to the base MRC, and only external per-GB costs feed into the per-GB rate. The business intent is that all usage-dependent costs should be converted into a single blended per-GB price — so the output is a clean base charge (fixed/shared infrastructure costs only) plus one usage rate per GB consumed.

Additionally, UPG_Bandwidth auto-populates from `aggregate_throughput_mbps` (total platform bandwidth), but as a per-MVNO usage SKU its quantity should reflect the per-MVNO share.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | `perMvnoMrc = fixedPool / N` — remove per-MVNO usage costs from base MRC | Usage costs are volume-dependent and belong in the per-GB rate, not the fixed base charge |
| D2 | `perGbRate = (perMvnoUsageCosts / estimatedGbPerMvno) + externalPerGb` where `estimatedGbPerMvno = subs_per_mvno × gb_per_sub_per_month` | Amortizes per-MVNO usage costs over actual expected GB (not capacity-derived), using subscriber-based estimate that aligns with how other per-MVNO SKUs are sized |
| D2b | New capacity input `gb_per_sub_per_month` — expected monthly data consumption per subscriber | Capacity throughput ≠ actual usage; subscriber-based estimation is more intuitive for sales and avoids utilization assumptions |
| D3 | UPG_Bandwidth auto-populate: `aggregate_throughput_mbps / num_mvnos` (was: `aggregate_throughput_mbps`) | Total platform bandwidth must be divided to get per-MVNO quantity |
| D4 | Sensitivity table: `perGbRate` is constant across N (estimatedGbPerMvno is per-MVNO, independent of N) | With subscriber-based GB estimate, per-MVNO usage costs and GB both scale per-MVNO — only base MRC varies with N |
| D5 | `totalSharedCost` = `fixedPool + (perMvnoUsageCosts × N) + (externalPerGb × totalMonthlyGb)` | Fix mixed-scope bug: current formula adds platform-wide fixed costs to single-MVNO usage costs |

## Guardrails

- **MUST:** `perMvnoMrc` contains only fixed/shared costs (base charges + shared usage + external fixed)
- **MUST:** `perGbRate` blends all per-MVNO usage costs and external per-GB into one rate
- **MUST:** Guard against division by zero when `estimatedGbPerMvno` is 0
- **MUST NOT:** Change quote builder, forecast scenarios, or edge function pricing logic

## Acceptance

- [ ] `perMvnoMrc = (baseCharges + sharedUsageCosts + externalFixed) / N` with no per-MVNO usage costs (verification: enter known values, manual calc matches)
- [ ] `perGbRate = (perMvnoUsageCosts / (subs_per_mvno × gb_per_sub_per_month)) + externalPerGb` (verification: enter known values, manual calc matches)
- [ ] UPG_Bandwidth auto-populates as `aggregate_throughput / num_mvnos` (verification: 5000 Mbit/s ÷ 5 MVNOs = 1000)
- [ ] Sensitivity table shows constant `perGbRate` across N, varying `perMvnoMrc` (verification: inspect table)
- [ ] New `gb_per_sub_per_month` input appears in UI, saves/loads correctly (verification: enter value, save, reload)
- [ ] Zero GB estimate handled gracefully — no crash, `perGbRate` shows 0 or fallback (verification: set gb_per_sub to 0)

## Phases

1. **Calculation engine** — update `calculateMvnePricing` formulas (perMvnoMrc, perGbRate, totalSharedCost), update `buildSensitivityTable` to pass per-MVNO usage costs and GB, update `computeSkuQuantities` for UPG_Bandwidth
2. **UI updates** — adjust output card labels/descriptions, update sensitivity table (perGbRate column now varies), ensure breakdown section reflects new cost flow
