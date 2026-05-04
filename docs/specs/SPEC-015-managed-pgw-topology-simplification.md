# SPEC-015: Managed Service Calculator — Topology Simplification & Rename

**Status:** decomposed
**Created:** 2026-05-04

## Problem

Two related polish items for the Managed PGW calculator:

1. **Topology inputs are over-specified.** The panel has 7 fields, two of which (`num_local_breakouts`, `num_grx_sites`) force the user to think in terms of site *type* — a distinction irrelevant when all Cennso sites are treated uniformly. Two separate vCore inputs follow from the same split.

2. **Naming is too product-specific.** The page is called "Managed PGW SaaS Pricing" with subheadings referencing the Vodafone IoT RFP. This should be a reusable generic tool, not a customer-specific artefact.

## Current Formula (for reference)

```
sites               = num_grx_sites + num_local_breakouts + 1   ← +1 is a hardcoded central site
Cennso_Sites        = sites
Cennso_vCores       = vcores_per_breakout × num_local_breakouts + vcores_per_pgw × num_grx_sites
Cennso_CoreCluster  = num_grx_sites + num_local_breakouts        ← sites − 1 (excludes central)
CNO_Sites           = sites
CNO_Nodes           = nodes_per_cno_site × sites
```

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Replace `num_local_breakouts` + `num_grx_sites` with single `num_sites` | No type distinction needed; one less concept for the user |
| D2 | Replace `vcores_per_breakout` + `vcores_per_pgw` with single `vcores_per_site` | Single vCore input per site covers uniform topology |
| D3 | `num_sites` = total site count (user enters full total, no hidden +1) | Transparent: what you type is what you get in the SKU quantities |
| D4 | `Cennso_CoreCluster = num_sites` | Uniform topology — every site has a cluster; old `sites − 1` was an artefact of the GRX/breakout split |
| D5 | Rename to "Managed Service Calculator"; route `/managed-pgw` → `/managed-service` | Generic tool, no customer or RFP references in UI |
| D6 | Source files and DB table name unchanged | No user-visible impact; migration cost not justified |

## Guardrails

- **MUST:** Existing saved configs (JSONB) with old field names load without error — migrate on read via a compat shim
- **MUST:** `Cennso_Sites`, `CNO_Sites`, `CNO_Nodes`, `Cennso_vCores`, `Cennso_CoreCluster` quantities still derive correctly from the new inputs
- **MUST NOT:** Change tier-variable or base SKU logic — only topology quantities are affected
- **MUST NOT:** Rename source files, hooks, or DB table
- **SHOULD:** Default values produce the same SKU quantities as the current defaults

## Acceptance

- [ ] Page title shows "Managed Service Calculator"; nav link shows "Managed Service"; no RFP/customer references anywhere in the UI (verification: visual inspection)
- [ ] Route `/managed-service` loads the page; old `/managed-pgw` redirects or is replaced (verification: navigate to both URLs)
- [ ] Topology panel shows 5 fields: Sites, vCores/Site, CNO Nodes/Site, CNO DB Instances, Tier 10 SAU Cap (verification: visual inspection)
- [ ] SKU quantities in breakdown match expected values for a known config (verification: unit test `computeTopologyQuantities`)
- [ ] Loading an old saved config (with `num_local_breakouts`/`num_grx_sites` fields) does not crash (verification: manual test with saved config)

## Phases

1. **Rename** — update page title, subtitle, nav label, and route path
2. **Formula + types** — update `ManagedPgwTopologyInputs`, `computeTopologyQuantities`, default values, and compat migration shim
3. **UI** — update `TopologyInputs` component to show the 5 new fields
