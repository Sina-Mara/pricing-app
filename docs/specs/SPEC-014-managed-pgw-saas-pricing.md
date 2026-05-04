# SPEC-014: Managed PGW SaaS Pricing Calculator

**Status:** decomposed
**Created:** 2026-04-30

## Problem

We need to produce a per-SAU/per-connection price schedule for a managed PGW service offering in response to the Vodafone IoT Managed PGW RFP. The output must fill the "SaaS Fees" tab of the pricebook template: 10 volume tiers × 5 contract years, with 6% annual price erosion from Year 2. The price covers all platform costs (CAS: Cennso + SMC + UPG, CCS, CNO + external infrastructure). No TPOSS or AI/LLM/HRS SKUs are in scope. Cost = price (no margin added).

The existing MVNE calculator splits costs across N MVNOs. This calculator is for a single customer but varies cost by SAU tier — the pricing dimension is connections, not MVNOs.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | SAU = SMC_sessions (CoS) directly | RFP defines SAU as concurrent attached connections — no sub×take-rate indirection |
| D2 | Per-SAU price calculated at tier maximum SAU | Conservative: ensures cost is covered at the worst-case volume in the tier. Tier 10 (5M+) uses a user-configurable SAU cap |
| D2b | UPG_Bandwidth = tier's peak throughput guardrail | Template already defines guardrail per tier (30/45/65 Gbps); no separate input needed |
| D3 | CCS = flat base charge only; no usage SKUs | CCS is Cennso's own charging system with a fixed monthly MRC — TPOSS and AI/LLM/HRS SKUs are excluded |
| D8 | No take rates needed | All remaining usage SKUs (Cennso, SMC, UPG, CNO) are topology- or tier-driven; CCS has no usage component |
| D4 | Cennso topology + CNO + external infra are fixed inputs | These are deployment-level decisions independent of connection count |
| D5 | Per-SAU price = total monthly cost at tier / tier SAU count | All platform cost amortised per connection; covers cost floor |
| D6 | 6% compound annual erosion applied to Year 1 price for Years 2–5 | Directly from RFP requirement |
| D7 | Standalone calculator page with save/load (like MVNE) | Reuses config persistence pattern; not part of quote system |

## Guardrails

- **MUST:** Components in scope: Cennso (base+usage), SMC (base+sessions), UPG (base+bandwidth), CCS (base charge only), CNO (base+usage), external infra
- **MUST:** Per-SAU price at each tier covers full platform cost (cost = price, no loss)
- **MUST:** Tier 10 (5M+) uses a configurable SAU cap entered by the user
- **MUST NOT:** Add margin or apply term/volume discounts from the SKU catalog
- **SHOULD:** Reuse `computeSkuQuantities` logic where applicable, factoring out SAU-driven quantities

## Acceptance

- [ ] 10-tier table displayed with columns: Tier, SAU range, Throughput guardrail, Unit price Y1–Y5 (verification: matches template structure)
- [ ] Price erosion applied correctly: Y2 = Y1 × 0.94, Y3 = Y1 × 0.94², etc. (verification: unit test)
- [ ] Changing SAU cap for Tier 10 updates the Y1 price (verification: manual UI test)
- [ ] All cost components visible in a breakdown panel (verification: toggle show/hide detail)
- [ ] Config save/load works (name, description, all inputs persisted) (verification: save → reload page → load → values match)

## Phases

1. **Calculation logic** — pure function `calculateManagedPgwTiers(fixedInputs, skuPricing, externalCosts)` returning 10 `TierRow` objects; unit tests
2. **DB + config persistence** — `managed_pgw_configs` table (JSONB inputs, save/load hooks)
3. **UI page** — `/managed-pgw` route, fixed inputs panel, tier table output, breakdown toggle, save/load
4. **Tier 10 cap + export** — configurable Tier 10 SAU cap; copy-to-clipboard / CSV export of the tier table
