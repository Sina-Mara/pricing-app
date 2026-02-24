# SPEC-002: Per-Period Forecast-to-Quote Generation

**Status:** decomposed
**Created:** 2026-02-01

## Problem

Quote generation from multi-year forecasts only supports a single commitment package. Users need two commitment modes (max across years vs yearly packages) and per-month pay-per-use to model different commercial strategies against the same forecast data.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Two commitment modes: max and yearly | Max gives single-package simplicity with full term discount; yearly gives per-year sizing flexibility |
| D2 | Max mode uses CommitmentSizingStrategy (peak/avg/P90/P95) | Reuses existing strategy picker for cross-year aggregation |
| D3 | Yearly mode always uses 12-month term per package | Each year is inherently a 12-month commitment |
| D4 | Pay-per-use creates one package per month | Shows month-by-month charge outlook across forecast |
| D5 | Single-scenario quotes skip mode selector entirely | Falls back to existing single-package behavior, no UI complexity |

## Guardrails

- **MUST:** Single-scenario quotes produce identical results to pre-feature behavior
- **MUST:** Yearly mode packages are sized independently per year's forecast
- **MUST NOT:** Allow term selector in yearly mode (term is always 12)
- **SHOULD:** Show package count preview before generation

## Acceptance

- [ ] Max commitment: 3-year forecast produces 1 package with 36-month term (verification: compare with manual calculation)
- [ ] Yearly commitment: 3-year forecast produces 3 packages with 12-month terms (verification: each package sized to its year)
- [ ] Pay-per-use: 3-year forecast produces 36 monthly packages (verification: month-by-month pricing correct)
- [ ] Single scenario: mode selector hidden, single package created (verification: no regression)
- [ ] Term discounts apply correctly per mode (verification: 36mo discount for max, 12mo for yearly)

## Phases

1. **Core generation functions** - CommitmentMode type, max/yearly/pay-per-use generators, year-grouping helpers
2. **UI components** - CommitmentModeSelector, PerPeriodPreview, ScenarioSelectionModal hints
3. **QuoteBuilder integration** - mode selector wiring, conditional strategy picker, quote type flows
4. **Verification** - multi-scenario tests, pricing validation, PDF export check
