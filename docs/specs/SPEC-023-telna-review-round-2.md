# SPEC-023: Telna Rate Sheet Review — Round 2

**Status:** ready
**Created:** 2026-08-25

## Problem

A second round of review feedback on the Telna rate sheet raised seven items: a missing Telna-specific CCS SKU, a full SKU code renaming scheme, a real per-period payment schedule (not just a 3-tier comparison), category-based sectioning in the PDF, and two terminology/labeling bugs (CCS acronym, discount naming) plus a signature-field relabel.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | New SKU `ccs-telna-base-m1`: base charge, category `ccs`, configured like `CCS_base` (no `apply_term_discount` override — normal term-discount behavior applies) | Explicitly confirmed analogous to the existing CCS_base mechanics |
| D2 | `ccs-telna-base-m1` base rate: €2,346.90/month (€2,000 + ~17.35% inflation adjustment, landing on a non-round figure per request) | €2,000 base + 15-20% inflation increase, deliberately uneven rather than a round number |
| D3 | `ccs-telna-base-m1` description is a placeholder for now — real customer-specific wording (GTP Hub, PGW, etc.) to be supplied later | Explicitly deferred |
| D4 | Rename 10 existing SKU codes to the new `<category>-<component>-<metric>-<period>` scheme (see table below); `/` characters kept as specified | Matches the requested schema exactly |
| D5 | `src/lib/managed-pgw-calculator.ts`'s hardcoded SKU-code references updated in lockstep with the rename | That file depends on these exact `code` strings for an unrelated feature (Managed PGW SaaS calculator); renaming without updating it would silently break that feature |
| D6 | `src/lib/pdf.ts`'s `DEFER_TO_END_SKU_CODES` updated to the new codes | Same reason — hardcoded old codes |
| D7 | PDF item table: top-level sections by category, fixed order **CCS → CAS → CNO** (skip empty sections); within each section, item order follows the existing Solution→Application→Component ordering (reusing `groupQuoteItems` for ordering only, not for its header rows) | Matches "sort/section by type" with the explicit CCS-CAS-CNO order given |
| D8 | The two 24/7 SKUs (`ccs-24/7-m1`, `ccs-24/7-add-h1`) stay inside the normal CCS section (they ARE category `ccs`, not a distinct section) — ordered last within that section, no separate header | Corrected mid-implementation: the earlier "own trailing section" idea was wrong; these are just CCS items like any other, and CCS sectioning already puts them near the top of the document, superseding the older "move to very end of document" rule from the prior review round |
| D9 | New "Payment Schedule" section (replaces/extends the existing 3-column Payment Options comparison) lists every individual period for **all three cadences** (Monthly/Quarterly/Annual), e.g. Month 1–36 for Monthly, Quarter 1–12 for Quarterly, Year 1–3 for Annual, each with its per-period amount | Explicit: "month 1 = X€, month 2 = X€, etc.", all 3 cadences, even though amounts repeat within a cadence in the common flat-pricing case |
| D10 | Fix `SkuCatalogDialog.tsx`'s `CATEGORY_LABELS`: CAS → "Cennso Application Support", CNO → "Cennso Network Operations", CCS → "Cennso Care Service" | Corrects a wrong "cloud-themed" expansion pattern across all three, sourced from material already established in this conversation |
| D11 | Rename "Customer Discount" → "CNS Discount" in user-facing labels: `QuoteBuilder`'s quote-level section heading, the per-item discount popover heading, and the PDF's discount line — **not** the underlying DB column names (`customer_discount_*` stay as-is; this is a display-string change only) | Explicit terminology correction; renaming live DB columns mid-flight is a disproportionately large, risky change for a label fix |
| D12 | PDF signature block (removed in SPEC-022 round 1) is reinstated, relabeled "Customer Approval" in place of "Customer Signature" | Explicit request to bring it back with new wording |

### SKU code rename table

| Old code | New code |
|---|---|
| `Cennso_base` | `cas-cennso-base-m1` |
| `Cennso_Sites` | `cas-cennso-site-m1` |
| `Cennso_vCores` | `cas-cennso-vcore-m1` |
| `Cennso_CoreCluster` | `cas-cennso-cc-m1` |
| `SMC_base` | `cas-smc-base-m1` |
| `SMC_sessions` | `cas-smc-cos-m1` |
| `UPG_base` | `cas-upg-base-m1` |
| `UPG_Bandwidth` | `cas-upg-atp-m1` |
| `CCS_24_7` | `ccs-24/7-m1` |
| `CCS_24_7_Overage` | `ccs-24/7-add-h1` |

`CCS_base`, `CNO_*`, `TPOSS_*`, `HRS_*`, LLM/Agent SKUs are unaffected — out of scope, not part of this rename.

## Guardrails

- **MUST** update every hardcoded reference to the 10 renamed codes across the whole repo (confirmed scope: `managed-pgw-calculator.ts`, `pdf.ts`) — a rename that silently breaks the Managed PGW calculator is unacceptable
- **MUST NOT** rename the `customer_discount_*` database columns — D11 is display-text only
- **MUST** keep the Payment Schedule's per-period amounts internally consistent with the existing Contract Total / Payment Discount / Customer(CNS) Discount math already shown above it — no new calculation path, just period-by-period breakdown of the same totals
- **SHOULD** cap the Payment Schedule at whatever the package's actual term is (e.g. 36 monthly rows for a 36-month term, not a fixed 12) and handle page breaks reasonably for the Monthly cadence's potentially-long list

## Phases

1. **Migration**: new `ccs-telna-base-m1` SKU + base charge; rename 10 SKU codes
2. **Cross-file code updates**: `managed-pgw-calculator.ts`, `pdf.ts`'s `DEFER_TO_END_SKU_CODES`
3. **PDF**: category sectioning (CCS→CAS→CNO, 24/7 SKUs trailing), full per-period Payment Schedule, "Customer Approval" signature block, "CNS Discount" label
4. **App**: `SkuCatalogDialog.tsx` category label fix; `QuoteBuilder`'s "Customer Discount" → "CNS Discount" (section heading + popover heading)
5. **Verify**: visual PDF check + confirm Managed PGW calculator still resolves its SKUs correctly after the rename
