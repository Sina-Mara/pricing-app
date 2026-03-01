# SPEC-012: MVNE Capacity → SKU Auto-Population

**Status:** decomposed
**Created:** 2026-03-01

## Problem

The MVNE Calculator requires users to manually enter quantities for every usage SKU, even though most quantities are directly derivable from the capacity assumptions already entered (subscribers, throughput, sites, etc.). This is error-prone and tedious. Additionally, all platform costs (base + usage) are currently pooled and split equally across N MVNOs, but in reality some usage SKUs (sessions, bandwidth, subscriber records) are per-MVNO costs — not shared infrastructure. The calculator needs capacity-driven auto-population of SKU quantities and a corrected cost model that distinguishes shared vs per-MVNO usage costs.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Add 5 new capacity input fields: `vcores_per_breakout`, `vcores_per_pgw`, `take_rate_pcs_udr`, `take_rate_ccs_udr`, `nodes_per_cno_site` | Required for vCore and CNO sizing formulas; take rates needed for PCS/CCS derivation from UDR |
| D2 | Usage SKUs split into **shared** (infrastructure) and **per-MVNO** (session/subscriber/throughput) categories | Infrastructure is platform-wide and split across N MVNOs; session/subscriber SKUs are sized and priced per single MVNO |
| D3 | Auto-populated quantities update when capacity inputs change; user can manually override any value; overridden values are excluded from recalculation until reset | Prevents surprise overwrites while keeping auto-population useful |
| D4 | Remove CNO_LACS_Portal, CNO_LACS_AAA, CNO_LACS_Gateway from MVNE calculator | Not needed in MVNE context per business requirements |
| D5 | Revised pricing formula: `perMvnoMrc = (sharedPool / N) + perMvnoUsageCosts` where sharedPool = base charges + shared usage costs + external fixed | Correctly models that per-MVNO usage costs are not shared across MVNOs |

## SKU Formulas

**Shared usage (costs split across N MVNOs):**

| SKU | Formula |
|-----|---------|
| Cennso_Sites | `num_grx_sites + num_local_breakouts + 1` |
| Cennso_vCores | `(vcores_per_breakout × num_local_breakouts) + (vcores_per_pgw × num_grx_sites)` |
| Cennso_CoreCluster | `num_grx_sites + num_local_breakouts` |
| CNO_Sites | `num_grx_sites + num_local_breakouts + 1` |
| CNO_Nodes | `nodes_per_cno_site × CNO_Sites` |
| CNO_DB | manual (no auto-populate) |

**Per-MVNO usage (costs apply per MVNO, not split):**

| SKU | Formula |
|-----|---------|
| SMC_sessions | `subs_per_mvno × parallel_take_rate` |
| UPG_Bandwidth | `aggregate_throughput_mbps` |
| TPOSS_UDR | `subs_per_mvno` |
| TPOSS_PCS | `subs_per_mvno × take_rate_pcs_udr` |
| TPOSS_CCS | `subs_per_mvno × take_rate_ccs_udr` |

## Guardrails

- **MUST:** Distinguish shared vs per-MVNO usage costs in the pricing formula
- **MUST:** Allow manual override of any auto-populated SKU quantity
- **MUST:** Persist overrides and new capacity inputs in saved configs (JSONB)
- **MUST NOT:** Change quote builder or forecast scenario calculations
- **SHOULD:** Visually indicate which SKU quantities are auto-derived vs manually overridden

## Acceptance

- [ ] Changing capacity inputs auto-populates SKU quantities per formulas above (verification: enter capacity values, check SKU quantities match expected formulas)
- [ ] Manually overriding an auto-populated SKU quantity persists and is not recalculated on next capacity change (verification: override a value, change a capacity input, verify overridden value unchanged)
- [ ] Per-MVNO MRC = (sharedPool / N) + perMvnoUsageCosts (verification: enter known values, compare manual calculation)
- [ ] CNO LACS SKUs (Portal, AAA, Gateway) no longer appear in MVNE calculator (verification: inspect UI)
- [ ] New capacity fields (vcores_per_breakout, vcores_per_pgw, take_rate_pcs_udr, take_rate_ccs_udr, nodes_per_cno_site) appear in UI and save/load correctly (verification: enter values, save, reload)
- [ ] Sensitivity table reflects corrected formula — shared costs vary with N, per-MVNO costs stay constant (verification: inspect table values)

## Phases

1. **Types + new capacity fields** — extend `MvneCapacityInputs` with 5 new fields, add SKU category type (shared vs per-MVNO), add override tracking type
2. **Calculation engine** — rewrite `calculateMvnePricing` to split shared vs per-MVNO usage costs, update sensitivity table, add auto-population formulas as pure functions
3. **UI: capacity inputs** — add new input fields to capacity section, wire auto-population to SKU quantity fields with override tracking
4. **UI: SKU table** — visual indicator for auto-derived vs overridden quantities, reset-to-calculated button, remove LACS SKUs
5. **Persistence** — ensure new fields save/load in JSONB config, migrate old configs missing new fields with sensible defaults
