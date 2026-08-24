# SPEC-022: Rate Sheet PDF — Review Fixes

**Status:** ready
**Created:** 2026-08-24

## Problem

Following a 2026-08-19 internal review of the Telna QT PDF export (built in SPEC-021), five gaps were raised:

1. The per-item customer-specific discount (SPEC-020) is only reachable via a click-into popover — invisible at a glance in both the app table and the PDF
2. Only the currently-selected payment-cadence discount is shown; the customer can't compare it against other billing frequencies
3. The document is titled "Quote" but at this stage it isn't a binding quote yet — it's a rate sheet
4. The PDF is portrait; the table is cramped (already needed column-width workarounds in SPEC-021)
5. Line items in the PDF are in raw `sort_order`, not the Solution → Application → Component structure used elsewhere in the app

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Add a "Cust. Discount" column to both `QuoteBuilder`'s line-items table and the PDF table, showing the set value (e.g. "-10%" / "-€50") or "-" | Supersedes SPEC-020 D11's "click into, not a column" call — real customer-facing review asked for visibility without a click. In `QuoteBuilder`, the existing per-item Popover becomes the editor triggered by clicking this column's cell/badge (not a separate icon), rather than adding a second UI affordance |
| D2 | Extract the Solution → Application → Component grouping/ordering logic (currently duplicated inline in `QuoteBuilder.tsx` and `QuotePresent.tsx`) into a shared pure function `groupQuoteItems()` in `src/lib/quote-item-grouping.ts`; PDF export consumes this new shared function | The PDF needs the exact same ordering already used in two other places — a third hand-rolled copy would drift. `QuoteBuilder.tsx`'s own already-working inline version is left untouched (out of scope, no reported issue there) |
| D3 | PDF item table renders the same group header rows as `QuotePresent` (Solution / Application / Component labels), using `jspdf-autotable`'s cell `colSpan` | Matches the "logical structure" the customer already sees in the Present view — consistent document family |
| D4 | Rename "Quote" → "Rate Sheet" in the PDF (heading, greeting line, downloaded filename `RateSheet-<number>.pdf`) and in `QuotePresent.tsx`'s header (`Rate Sheet <number>` fallback when no title is set) | Signals non-binding status at this stage, per review feedback. The app's internal `Quotes`/`QuoteBuilder` terminology, routes, and DB naming are unchanged — this is presentation-layer only |
| D5 | PDF orientation: landscape | More horizontal room for the now-wider table (adds the Cust. Discount column) without the width workarounds SPEC-021 needed |
| D6 | New "Payment Options" section at the very bottom of the PDF (after the existing Grand Total / Contract Total / discount breakdown, before the closing signature), showing Discounted Contract Total under three payment cadences: Monthly (1 month upfront), Quarterly (3 months upfront), Annual (12 months upfront) — fetched live from `payment_cadence_factors` | Lets the customer compare billing-frequency options side by side, not just see the one currently selected in the app. Three tiers only, per explicit scope ("monthly, quarterly, annual is sufficient for now") — not all 8 seeded tiers |
| D7 | The Payment Options section always nets out the existing quote-level customer discount (SPEC-020) alongside each cadence's own discount, since that concession isn't tied to billing frequency | Keeps the three totals internally consistent with the single "Discounted Contract Total" line already shown above it |
| D8 | Payment Options section only renders for `quote_type === 'commitment'` | Pay-per-use quotes have no term/cadence concept (fixed 1-month term, no cadence discount applies) |

## Guardrails

- **MUST NOT** change any pricing calculation — this is presentation/layout only; Payment Options totals are computed client-side from already-known `total_monthly`, package term, and cadence factors, mirroring the existing Contract Total math, not a new calculation path
- **MUST** keep `QuoteBuilder.tsx`'s existing grouping logic working exactly as today — only add the new shared function for the PDF (and optionally have `QuotePresent` adopt it later; not required by this spec)
- **MUST NOT** rename anything in the database schema, routes, or internal app terminology — "Rate Sheet" is a display-string change only

## Acceptance

- [ ] `QuoteBuilder`'s line-items table shows a "Cust. Discount" column; clicking it opens the existing edit popover
- [ ] PDF line-items table shows the same "Cust. Discount" column
- [ ] PDF line items are grouped/ordered via the new shared `groupQuoteItems()` function, with visible group header rows (Solution / Application / Component)
- [ ] PDF heading, intro sentence, and downloaded filename say "Rate Sheet" instead of "Quote"
- [ ] `QuotePresent.tsx` header falls back to "Rate Sheet <number>" instead of "Quote <number>" when no title is set
- [ ] PDF is landscape orientation
- [ ] PDF's very bottom (before signature) shows a Monthly / Quarterly / Annual comparison of the Discounted Contract Total, only for commitment quotes
- [ ] Generated PDF verified visually before considering this done

## Phases

1. **Shared grouping utility** — `src/lib/quote-item-grouping.ts`
2. **PDF rewrite** — landscape, Rate Sheet naming, grouped/ordered table with Cust. Discount column, Payment Options bottom section (fetches `payment_cadence_factors` for 1/3/12 months)
3. **QuoteBuilder column** — add Cust. Discount column, wire to existing popover
4. **QuotePresent rename** — "Rate Sheet" fallback header text
5. **Verify** — generate a real PDF from a live quote and visually inspect it
