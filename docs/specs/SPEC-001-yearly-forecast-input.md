# SPEC-001: Yearly Forecast Direct Input

**Status:** decomposed
**Created:** 2026-01-25

## Problem

Users can only create forecasts via Excel upload. They need direct manual input of yearly forecast data (end-of-year SIMs and total data usage), with the ability to generate scenarios and create quotes (pay-per-use or commitment) from that input.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Both scenario types available: one-per-year and consolidated | Users need flexibility for different forecast strategies |
| D2 | Linear interpolation from yearly to monthly | Spreads yearly growth evenly, simplest accurate model |
| D3 | Flexible commitment terms (1-60 months) | Reuses existing term range in quote builder |
| D4 | Store yearly forecasts with `granularity: 'yearly'` in existing timeseries tables | Avoids new schema, reuses infrastructure |
| D5 | Derive GB/SIM from total data usage / SIMs | User provides total data usage (more natural), system derives per-SIM |

## Guardrails

- **MUST:** Produce identical pricing results to Excel-uploaded forecasts with same data
- **MUST:** Support both pay-per-use and commitment quote generation
- **MUST NOT:** Break existing Excel upload or time-series forecast flows
- **SHOULD:** Auto-calculate derived values (GB/SIM, monthly interpolation) on input change

## Acceptance

- [ ] Enter yearly data (SIMs + GB) directly in table UI (verification: manual test)
- [ ] Generate per-year and consolidated scenarios from input (verification: scenario outputs match expected KPIs)
- [ ] Create commitment quotes with strategy picker (peak/avg/P90) (verification: pricing matches manual calculation)
- [ ] Create pay-per-use quotes from forecast (verification: monthly packages generated)
- [ ] Existing Excel upload flow unchanged (verification: regression test)

## Phases

1. **Forecast input UI** - yearly table component, GB/SIM derivation, monthly interpolation
2. **Scenario generation** - per-year and consolidated modes, scenario selection UI
3. **Quote generation** - pay-per-use and commitment flows, strategy picker, term selection
4. **Testing** - validation tests, full workflow verification
