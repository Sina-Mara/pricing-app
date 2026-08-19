# SPEC-018: Payment Cadence Discounts

**Status:** implemented
**Created:** 2026-06-01

## Problem

The pricing engine currently rewards *what* a customer commits to (volume) and *how long* they commit (term), but not *when* they pay. Customers who pay annually or quarterly upfront reduce collection risk and admin overhead — commercially this warrants a discount, and it is a standard lever in B2B SaaS negotiations.

A payment cadence factor should be added as a fourth independent discount layer alongside volume, term, and environment factors. Monthly billing remains the baseline (factor 1.0) so no existing quotes are affected.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Payment cadence discount is applied to the contract total, not the unit price | Cadence is a billing-level concept — a 3-year annual-upfront deal discounts the 3-year sum, not the monthly unit rate |
| D2 | Discount is keyed by upfront payment term in months (1, 3, 6, 12, 24, 36, 48, 60) | Mirrors term-factor table structure; aligns with how commitment lengths are already modelled |
| D3 | Default upfront term is 1 month (0% discount) | Zero impact on existing quotes; opt-in discount only |
| D4 | Discount table is admin-configurable; seeded with known values | Sales team needs flexibility to adjust levels; seed: 1m→0%, 3m→2%, 6m→4%, 12m→6%, 24m→15%, 36m→23%, 48m→25%, 60m→30% |
| D5 | Quote UI exposes a dropdown of configured upfront payment terms (in months); selection lives at quote level, not per line item | Payment terms apply to the whole contract; month-based values match the lookup table directly |
| D6 | Payment discount % is manually overridable per quote | Allows sales to negotiate a custom rate; admin-configured cadence value is the default, override is quote-specific |

## Guardrails

- **MUST:** Monthly cadence produces factor 1.0 — no change to any existing quote price
- **MUST NOT:** Allow cadence discount on Pay-Per-Use quotes (payment terms only apply to fixed-commitment contracts)
- **MUST:** Cadence factors ≤ 1.0 (discounts only, no surcharges via this field)
- **SHOULD:** Display selected cadence and its discount % clearly in quote output and PDF export

## Acceptance

- [ ] Annual upfront cadence reduces final price vs monthly baseline (verification: unit test + UI comparison)
- [ ] Monthly cadence produces identical price to pre-feature quotes (verification: regression test on existing quote fixtures)
- [ ] Pay-Per-Use quotes have no cadence selector (verification: E2E — field absent on PPU quote form)
- [ ] Admin can update cadence factor values and changes reflect immediately in new quotes (verification: E2E admin flow)
- [ ] Cadence discount is visible as a line in quote summary and PDF (verification: E2E export check)

## Phases

1. **DB & Admin** — add `payment_cadence_factors` table, seed default values, admin config page
2. **Pricing Engine** — apply cadence factor in calculation formula, update formula docs
3. **Quote UI** — add cadence selector to quote builder (commitment quotes only), pass to pricing engine
4. **Output & Export** — show cadence discount in quote summary breakdown and PDF
5. **Tests** — unit tests for cadence factor application, E2E for admin config and quote flow
