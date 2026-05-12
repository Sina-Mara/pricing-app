# SPEC-016: Managed Service Calculator — Pricing Enhancements

**Status:** decomposed
**Created:** 2026-05-04

## Problem

Three gaps identified in peer review of the Managed Service Calculator:

1. Commitment discounts were explicitly removed in SPEC-014 but are commercially relevant — a customer committing to 3 years should see a lower price than a 1-year deal. The term factor tables for all categories (CAS, CNO, CCS) already exist in the pricing engine.

2. The calculator prices connections (per-SAU) but ignores data volume. A managed PGW carries traffic; the cost of that traffic (transit, GRX, infrastructure per GB) must be reflected in the output, consistent with how the MVNE calculator handles per-GB costs.

3. The CCS base charge is currently a flat DB lookup. In practice it is a 10% annual maintenance fee on the Realisierungsprojekt (RP) value — the total implementation project cost. This should be a user input so the CCS cost scales with the actual project.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Term factors applied per SKU category (CAS, CNO, CCS) to each SKU's unit price before per-SAU division | Consistent with rest of pricing engine; already seeded in `term_factors` table |
| D2 | Commitment length selector (12 / 24 / 36 / 48mo) in inputs panel; not visible as a separate output column | User wants discounts in the cost floor, not as extra output columns |
| D3 | Per-GB costs blended into per-SAU: `gb_per_sau_per_month` input × tier SAU count = estimated total GB; GB cost added to tier total before dividing by SAU | Preserves single-price output; mirrors MVNE `gb_per_sub_per_month` approach |
| D4 | Per-GB cost source: extend external cost items with a `per_gb` field (€/GB), same pattern as MVNE | Reuses existing external cost UI; no new SKU needed |
| D5 | CCS monthly cost = `rp_value × 0.10 / 12`; `rp_value` is a user input; the `CCS_base` value from the `base_charges` table is ignored | RP = Realisierungsprojekt total value; 10% p.a. maintenance fee is the established derivation |

## Guardrails

- **MUST:** Term factors sourced from `term_factors` table, not hardcoded
- **MUST NOT:** Change the tier table structure — output remains Y1–Y5 per-SAU prices
- **MUST:** `rp_value`, `gb_per_sau_per_month`, and `commitment_months` persist with saved configs
- **SHOULD:** Breakdown panel shows GB cost contribution per tier so the blending is auditable

## Acceptance

- [ ] Changing commitment length updates all tier prices (verification: switch 12mo → 36mo, prices drop per CAS/CNO/CCS term factors)
- [ ] Setting `gb_per_sau_per_month > 0` increases tier prices; breakdown shows GB cost line (verification: manual input test)
- [ ] `rp_value` input changes CCS cost in breakdown; at reference values matches 10% p.a. formula (verification: unit test)
- [ ] All three new inputs persist through save → reload → load config (verification: manual test)

## Phases

1. **Commitment discounts** — fetch term factors from DB; add `commitment_months` selector to inputs; apply per SKU category in `calculateManagedPgwTiers`
2. **Per-GB costs** — add `per_gb` field to `ManagedPgwExternalCostItem`; add `gb_per_sau_per_month` to topology inputs; blend GB cost into tier total
3. **CCS RP driver** — add `rp_value` to topology inputs; replace `baseCharges['CCS_base']` DB lookup with `rp_value × 0.10 / 12` in the calculation
