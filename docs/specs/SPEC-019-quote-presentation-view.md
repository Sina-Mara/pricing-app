# SPEC-019: Quote Presentation View

**Status:** draft
**Created:** 2026-08-12

## Problem

`/quotes/:id` renders `QuoteBuilder`, an edit-oriented page that exposes internal pricing mechanics alongside the quote itself: list price, discount %, volume/term/env factors, the base/usage ratio slider, commitment-strategy config, payment-discount-override math, and Save/Calculate/Add/Delete controls. When a rep screen-shares this page in a customer meeting, all of that internal configuration and margin structure is visible. There is no read-only, customer-safe view of a quote to share on screen.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | New route `/quotes/:id/present` backed by a new page `QuotePresent.tsx`, separate from `QuoteBuilder` | Guarantees no accidental leakage of internal fields/controls, rather than threading a "hide internal stuff" flag through a 2200-line edit component |
| D2 | Read persisted fields only (`quote_items.unit_price`, `monthly_total`, etc.) via the same Supabase query shape as `QuoteBuilder`; never call `calculate-pricing` | Presentation view must not trigger recompute or mutate quote state mid-meeting |
| D3 | Line items show SKU description, quantity, and monthly total only — no `list_price`, `discount_pct`, or volume/term/env factor columns | These directly expose margin structure |
| D4 | Keep existing Solution → Application → Component → package grouping for layout continuity, but render as static rows (no collapsible edit chrome, no SKU catalog dialog) | Familiar structure for the rep, but display-only |
| D5 | Summary shows Monthly Total, Annual Total, and Contract Total (post-discount) only — no payment-discount-pct/amount breakdown, no ratio slider, no term-factor/commitment controls, no auto-calculate toggle | Final numbers are customer-appropriate; the math behind them is not |
| D6 | Header shows customer name, quote number/title, status badge, valid-until — no "More" menu (Export/Compare/Timeline), no Save/Calculate buttons | Removes every mutation entry point from the shareable screen |
| D7 | Route stays behind the existing `ProtectedRoute`/auth, same as other routes | The customer never logs in — the rep views it while authenticated and shares their screen; no need for a public/unauthenticated link |
| D8 | Add a "Present" entry point (link/button) from `QuoteBuilder`'s header into `/quotes/:id/present` | Discoverable without needing to hand-type the URL before a meeting |

## Guardrails

- **MUST NOT** render `list_price`, `discount_pct`, volume/term/env factor values, base/usage ratio, commitment-strategy internals, payment-discount override/pct/amount breakdown, or `quote.notes`
- **MUST NOT** include any edit or mutation control (no Save, Calculate, Add, Delete, version/compare dialogs)
- **MUST** show numbers identical to what's currently persisted on the quote (no separate recalculation path)
- **SHOULD** be visually clean/minimal — this is the thing on screen during a live meeting

## Acceptance

- [ ] `/quotes/:id/present` renders a read-only view of the quote
- [ ] Header: customer, quote number/title, status, valid-until — no edit controls
- [ ] Line items: SKU description, quantity, monthly total only — no list price/discount/factor columns
- [ ] Summary: Monthly/Annual/Contract totals only — no discount math breakdown, no config controls
- [ ] No Save/Calculate/Add/Delete/dialog controls anywhere on the page
- [ ] A "Present" link/button on `QuoteBuilder` opens the new view for the current quote

## Phases

1. **Page + route** — `src/pages/QuotePresent.tsx`, registered at `/quotes/:id/present` in `App.tsx`
2. **Data fetch** — reuse the quote+customer+packages+items query shape from `QuoteBuilder`, projected down to the customer-safe fields
3. **Read-only UI** — header, grouped line items, summary totals; no inputs/dialogs/mutations
4. **Entry point** — "Present" button in `QuoteBuilder`'s header linking to the new route for the current `id`
