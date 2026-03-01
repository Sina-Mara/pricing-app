# SPEC-010: MVNE Pricing Calculator

**Status:** decomposed
**Created:** 2026-03-01

## Problem

We need to determine per-MVNO pricing (base MRC + per-GB rate) for "Quick MVNO" customers who share a common MVNE infrastructure. Today this is done manually. A standalone calculator page lets sales model shared infrastructure costs, adjust capacity assumptions, and see how per-MVNO price changes as the number of tenants shifts. Output informs what price to set on `MVNO_Builder_base` in Admin UI.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Standalone calculator page, not a quote builder extension | Keeps existing single-customer quote flow untouched |
| D2 | Two cost buckets: platform (auto-priced) + external (manual entry) | Platform SKUs (Cennso, SMC, UPG, TPOSS, HRS) have DB prices; external costs (infra VMs/IPs/storage, GRX, eSIMs) don't map to existing SKUs |
| D3 | User enters SKU quantities manually; calculator pulls unit prices from DB | Capacity inputs (subs, throughput) are reference context only — no auto-derivation of SKU quantities in v1 |
| D4 | Equal split / N MVNOs, no margin layer | Pure cost allocation; per-GB = total variable costs / total expected GB |
| D5 | Pure frontend calculation; persist configs to a lightweight Supabase table | Simple arithmetic doesn't need Edge Function; save/load lets sales revisit scenarios |

## Guardrails

- **MUST:** Output per-MVNO base MRC and per-GB rate
- **MUST:** Pull existing SKU unit prices and base charges from DB as defaults
- **MUST NOT:** Modify quote builder or Edge Function pricing logic
- **SHOULD:** Show sensitivity table (cost at 5 / 7 / 10 MVNOs)

## Acceptance

- [ ] Calculator page accessible from nav (verification: click link, page loads)
- [ ] Platform SKU unit prices pre-filled from DB (verification: change price in Admin, calculator reflects it)
- [ ] Manual entry fields for external costs — infra, GRX, eSIMs (verification: enter value, total updates)
- [ ] Output shows per-MVNO base MRC and per-GB rate (verification: matches manual calculation)
- [ ] Sensitivity grid shows cost at different MVNO counts (verification: columns with correct math)
- [ ] Calculator config can be saved and reloaded (verification: save, refresh, load, values restored)

## Phases

1. **Schema + data model** — `mvne_calculator_configs` table, seed default capacity assumptions
2. **Cost input panel** — SKU quantity inputs with DB-sourced unit prices, manual external cost fields, capacity reference inputs
3. **Calculation engine** — per-component cost aggregation, equal split by N, per-GB rate derivation
4. **Output display** — per-MVNO summary card, sensitivity table, cost breakdown
5. **Persistence** — save/load configs, link to named scenarios
