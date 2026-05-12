# SPEC-017: CNS Cost Sharing for Managed Service Calculator

**Status:** decomposed
**Created:** 2026-05-12

## Problem

The Managed Service Calculator currently attributes all cost items fully to the single customer being priced. In reality, three infrastructure cost items (Cennso Base, CNO Management Base, CNO 24/7 Support) are shared across multiple CNS customers on the same platform. Each customer should only be charged their proportional share, derived from their node count relative to the total pool.

The share percentages must be editable (node-based auto-calculation with manual override) and managed globally, not per-config.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Global `cns_pool` table in DB, not per-config | Share ratios are a platform-level fact, not per-quote |
| D2 | Computed share = nodes / Σ nodes; overridable per-row | Nodes are the natural cost driver; override handles negotiated splits |
| D3 | Exactly one row flagged `is_this_customer` | Calculator always prices one customer; flag identifies which row applies |
| D4 | Shared SKUs: `Cennso_base`, `CNO_base`, `CNO_24_7` | Confirmed by product owner; SMC Base / UPG Base kept non-shared for now |
| D5 | Breakdown shows full cost × share % = allocated | Makes allocation auditable and transparent |
| D6 | Admin UI at `/admin/cns-pool`; calculator shows read-only badge | Separation of concerns; pool mgmt is an admin task |

## Guardrails

- **MUST:** `totalMonthlyCost` uses allocated (not full) cost for shared SKUs
- **MUST:** Exactly one `is_this_customer = true` row enforced at app level (warn + block save if violated)
- **MUST NOT:** Expose CNS pool editing from the calculator page itself
- **SHOULD:** Warn when manual overrides don't sum to 100%
- **SHOULD:** Seed with GMCP (17), LACS (194), HBW (15), VF (30, this customer)

## Acceptance

- [ ] Admin page lists all CNS rows with name, nodes, computed %, override %, this-customer flag (verification: navigate to `/admin/cns-pool`)
- [ ] Changing nodes auto-recalculates computed % for all rows (verification: edit node count, observe % update)
- [ ] Setting override % on a row uses that value instead of computed % (verification: set override, check share applied in calculator)
- [ ] Exactly one row can be flagged as this-customer; switching flag moves it (verification: click different row's radio)
- [ ] Managed Service Calculator breakdown shows `€X × Y% = €Z` for the 3 shared SKUs (verification: view Tier breakdown)
- [ ] `totalMonthlyCost` reflects allocated share, not full shared cost (verification: check tier total math)
- [ ] Calculator page shows read-only "Your share: X%" badge (verification: load calculator page)

## Phases

1. **DB migration** — create `cns_pool` table, seed with 4 example rows
2. **Calculator logic** — add `customerSharePct` param, mark shared SKUs, split `fullCost` vs `allocatedCost` in breakdown
3. **Admin UI** — `/admin/cns-pool` page with inline-editable table, add/delete, warning on bad sum
4. **Calculator page** — read share % from DB, display badge, pass to calculation
