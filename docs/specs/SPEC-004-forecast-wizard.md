# SPEC-004: Forecast Wizard

**Status:** draft
**Created:** 2026-02-24

## Problem

The forecast-to-quote flow has 3 disconnected entry points with no guidance. The 4-step workflow isn't well-signposted, quote type is forced too early (before seeing pricing), pay-per-use auto-generates with no review step, and there's no back-navigation from QuoteBuilder to forecast.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Single guided wizard at `/forecast/wizard` as primary entry | Replaces 3 confusing entry points with one guided flow |
| D2 | 4 steps: Input → Scenarios → Configure → Generate | Natural progression; quote type decision deferred to step 3 |
| D3 | Keep existing pages under collapsible "Advanced" sidebar section | Power users retain direct access; no functionality removed |
| D4 | Extract forecast save logic into `useForecastSave` hook | Eliminates duplication between wizard and YearlyForecastPage |
| D5 | All state in useState, same pattern as existing pages | Consistent with codebase conventions, no new state management |

## Guardrails

- **MUST:** All functionality from existing pages accessible in wizard
- **MUST:** Back navigation between all steps (step 3→2 with confirmation)
- **MUST NOT:** Remove existing forecast pages (advanced users need them)
- **SHOULD:** Auto-save forecast when advancing from step 1 to step 2
- **SHOULD:** Reuse existing components (YearlyForecastInput, CommitmentStrategyPicker, ManualSkuInput)

## Acceptance

- [ ] Wizard loads at `/forecast/wizard` with step 1 active (verification: navigate and inspect)
- [ ] Enter yearly data → Next → scenarios generated → Next → configure quote → Generate (verification: end-to-end manual test)
- [ ] Back navigation works between all steps (verification: manual test)
- [ ] Sidebar shows wizard as primary, existing pages under Advanced collapse (verification: visual check)
- [ ] Existing pages `/forecast`, `/forecast/yearly`, `/forecast/timeseries` still work (verification: regression test)
- [ ] Load existing forecast populates step 1 (verification: manual test)

## Phases

1. **Foundation** - WizardStepper component, useForecastSave hook extraction
2. **Wizard core** - ForecastWizardPage steps 1-2 (input + scenarios)
3. **Wizard completion** - steps 3-4 (configure + generate), navigation wiring
4. **Integration** - App.tsx route, Sidebar restructure, YearlyForecastPage refactor
