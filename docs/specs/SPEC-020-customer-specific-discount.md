# SPEC-020: Customer-Specific Discount

**Status:** ready
**Created:** 2026-08-19

## Problem

Pricing today is entirely systematic: volume discounts, term discounts, environment factors, and (since SPEC-018) a payment-cadence discount — all driven by tables/formulas, none of them a free-form negotiated concession. Reps have no way to record a one-off, deal-specific discount (e.g. "-5% loyalty discount per the Jan 2026 agreement" or "-€10,000 signing credit") without hand-editing prices and losing the paper trail of *why* the number is what it is. This needs to exist at two levels: a whole-quote discount, and an occasional per-line-item override for a specific SKU.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Two independent layers: quote-level discount + optional per-item discount | Matches how the rest of pricing already layers (item-level volume/term/env, quote-level payment cadence) |
| D2 | Each layer supports **either** a percentage or a fixed € amount, rep's choice | A negotiated concession is sometimes "-5%", sometimes "-€10,000" — forcing one type doesn't match real deals |
| D3 | Quote-level: `customer_discount_type` (`percent`\|`fixed`), `customer_discount_value`, `customer_discount_note` (optional) on `quotes` | Mirrors the existing `payment_discount_override`/`payment_upfront_months` shape on the same table |
| D4 | Quote-level discount applies to **Contract Total**, stacking additively alongside the payment-cadence discount (both computed off the same pre-discount contract total, then summed and subtracted) | "One-off" implies a one-time concession on deal value, not a recurring monthly reduction; additive (not compounding) keeps each discount independently auditable — "-6% payment cadence, -€10,000 customer discount" is easier to verify than a compounded percentage |
| D5 | Per-item: `customer_discount_type`, `customer_discount_value`, `customer_discount_note` (optional) on `quote_items`, nullable — absent means "no override" | Only occasionally needed; nullable keeps the common case (no per-item override) free of clutter |
| D6 | Per-item discount slots into the existing multiplicative chain: `unit_price = priceAtQty × termFactor × envFactor × (1 − customer_pct/100)` for percentage, or `... − customer_fixed_per_unit` for fixed | Consistent with how volume/term/env factors already combine; `total_discount_pct` (already derived as `1 − unit_price/list_price`) automatically reflects the new layer with no separate rollup logic needed |
| D7 | Notes are optional free text on both layers | Encourages justification without blocking calculation on an empty field |
| D8 | Visible to the customer: Present view (SPEC-019) shows the quote-level discount as an explicit line (e.g. "Special Discount: −5%" or "Special Discount: −€10,000"), same treatment as the existing Contract Total/Payment Discount lines | Reps want to show the customer they're getting a deal, unlike the internal-only payment-cadence math breakdown |
| D9 | Per-item discount is NOT separately called out in the Present view | Present view already only shows SKU/qty/monthly total per line (SPEC-019 D3) — a per-item discount just lands in that line's monthly total, same as any other discount layer |
| D10 | Neither discount carries forward to a new quote version — always resets to unset | Simpler than deciding whether a negotiated concession still applies under different terms/quantities; rep re-applies deliberately each version, avoiding stale discounts silently surviving a renegotiation |
| D11 | Per-item discount UI is "click into," not an always-visible inline field | The line-items table already has 6 columns (SKU, Qty, List Price, Discount, Unit Price, Monthly) plus row actions; a 7th always-on column for a rarely-used field would crowd it. A small icon button per row opens a Popover (type toggle, value input, optional note, Apply/Clear) — same "click to reveal" spirit as the SKU detail dialog on `/skus`. The button shows a visible indicator (e.g. filled vs. outline icon, or the discount value as a badge) when a discount is set, so it's not invisible once applied |

## Guardrails

- **MUST NOT** change existing volume/term/env factor or payment-cadence calculations — this is an additive layer
- **MUST** persist `customer_discount_type`/`value`/`note` at both quote and item level so the reasoning survives a page reload / version copy
- **MUST** show the quote-level discount as its own line in both `QuoteBuilder`'s summary and the `QuotePresent` view
- **MUST** reset both discounts (quote-level and per-item) to unset when a new quote version is created — never copy them forward
- **MUST** wire both new inputs into the auto-calculate flow (debounced `calculatePricingRef.current()`), not just the manual Calculate button — this exact bug was just fixed for Commitment Term and Payment Cadence; must not reintroduce it here

## Acceptance

- [ ] `quotes.customer_discount_type/value/note` exist; editable in Quote Summary sidebar (percent or fixed, rep's choice)
- [ ] `quote_items.customer_discount_type/value/note` exist; editable via a per-row "click into" popover (not an always-visible column)
- [ ] Contract Total calculation subtracts the quote-level customer discount alongside the payment-cadence discount, both computed off the same base and summed
- [ ] Per-item unit price reflects the item-level override consistently with the existing volume/term/env multiplicative chain
- [ ] Changing either discount input while Auto-calculate is on triggers recalculation without a manual Calculate click
- [ ] `QuotePresent` shows the quote-level discount as a visible line; per-item discounts are not separately broken out
- [ ] Existing quotes with no customer discount set behave identically to today (nullable fields, zero-effect default)
- [ ] "Create New Version" never copies `customer_discount_*` fields (quote or item level) to the new version

## Phases

1. **Schema** — migration adding `customer_discount_type/value/note` to `quotes` and to `quote_items`
2. **Edge function** — `calculate-pricing`: add the per-item multiplicative/subtractive step; add the quote-level additive Contract Total step; return the new fields in the response, matching the existing `payment_discount_pct`/`payment_discount_amount` pattern
3. **QuoteBuilder UI** — quote-level discount type/value/note inputs in the Quote Summary sidebar (wired into auto-calculate); per-item "click into" Popover (icon button per row → type/value/note, with a set/unset visual indicator)
4. **QuotePresent UI** — add the "Special Discount" line to the summary, following the existing Contract Total/Payment Discount display pattern
