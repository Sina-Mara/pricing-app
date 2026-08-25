# SPEC-026: Dedicated PDF Section for Usage-Based Overages

**Status:** ready
**Created:** 2026-08-25

## Problem

The CCS 24/7 overage SKU (`ccs-24/7-add-h1`) is usage-based (an hourly rate for support hours beyond the included allowance) but currently renders inside the normal CCS item table alongside fixed monthly base charges, sorted last (SPEC-023 D8). Mixing a variable, usage-billed line into a table of guaranteed monthly charges misrepresents it as a committed recurring cost.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | `ccs-24/7-add-h1` is pulled out of every package's item table entirely and rendered in one combined **"Usage-Based Overages"** section near the end of the document (after Payment Schedule, before the signature block) | Confirmed: one combined section, not per-package callouts — keeps the per-package tables focused on committed charges |
| D2 | The overage line's amount is **excluded** from Package Subtotal, Grand Total, Contract Total, and the Payment Schedule — those now reflect only committed fixed/known charges | Confirmed. Consistent with the existing reasoning in migration 031 (`apply_term_discount` opt-out): usage can't be known in advance, so it shouldn't inflate committed totals |
| D3 | The dedicated section shows rate-card info only — SKU, Description, Unit Price, Unit, and which Package it's attached to — with **no quantity or computed amount column** | A quantity/amount pair here would look like a computed charge, undermining the point that this isn't a committed number. A short caption states it's billed on actual usage and excluded from totals above |
| D4 | This is a **presentation-layer adjustment scoped to `pdf.ts` only** — the live QuoteBuilder UI's on-screen totals (Package Subtotal, Grand Total, etc.) are unchanged; only the exported PDF's totals differ from the app's live view when a package has overage-line quantity on it | Matches what was actually asked ("in the PDF"); changing the backend `calculate-pricing` totals would affect every other view of the quote, a much larger blast radius than requested |

## Guardrails

- **MUST NOT** modify `calculate-pricing` edge function or any persisted `subtotal_monthly`/`total_monthly` values — adjustment is computed locally inside `generateQuotePDF` for display only
- **MUST** subtract the overage item(s)' `monthly_total`/`annual_total` from the *same* package/quote totals used everywhere downstream (Package Subtotal → Grand Total → Contract Total → Payment Schedule), so the numbers stay internally consistent within the PDF
- **SHOULD** flag to the user that the PDF's totals can now diverge from the live QuoteBuilder screen when overage quantity is set on a quote (D4) — this is an intentional, scoped choice, not an oversight

## Phases

1. Identify and pull `ccs-24/7-add-h1` line items out of each package's item table during the existing per-package section-building loop; accumulate them (with package name) for the combined section later
2. Adjust each package's displayed subtotal, and the quote's displayed grand total / contract total / payment-schedule base, by subtracting the accumulated overage amounts
3. Render the "Usage-Based Overages" section after Payment Schedule, before the signature block
4. Verify: typecheck, unit tests, and a manual PDF export with a quote that has overage-line quantity set, confirming Package Subtotal/Grand Total/Payment Schedule now exclude it and the new section shows the rate correctly
