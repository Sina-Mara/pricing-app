# SPEC-003: Base/Usage Ratio Knob for CAS Pricing

**Status:** decomposed
**Created:** 2026-02-24

## Problem

CAS prices have a fixed base charge and a variable usage charge, seeded at a 60/40 split. Sales reps need to adjust this split per quote to model different commercial strategies (high commitment vs pay-per-use) without changing the underlying list price.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Single ratio value R (0.01-0.99) stored at quote level | All CAS items in a quote share the same ratio; simpler than per-item |
| D2 | Math: base × (R/0.60), usage × ((1-R)/0.40) | Linear scalar relative to seeded reference; R=0.60 produces multiplier 1.0 |
| D3 | CAS category only, non-CAS unaffected | Only CAS has base+usage structure; other categories have single unit price |
| D4 | Store ratio_factor on quote_items for auditability | Enables exact price reproduction without re-running formula |
| D5 | Default 0.60 requires no data migration | Existing quotes produce identical prices at default ratio |

## Guardrails

- **MUST:** Ratio 0.60 produces identical prices to pre-feature state
- **MUST:** Non-CAS SKUs are completely unaffected regardless of ratio
- **MUST NOT:** Change discount percentages (ratio is applied after all other pricing factors)
- **SHOULD:** Auto-recalculate when ratio changes

## Acceptance

- [ ] Ratio 0.80: base charges increase ~33%, usage prices decrease ~50% (verification: unit test)
- [ ] Ratio 0.60: all prices unchanged (verification: unit test)
- [ ] Ratio 0.10: base charges drop ~83%, usage prices increase ~125% (verification: unit test)
- [ ] Non-CAS items unaffected (verification: unit test)
- [ ] Save and reload quote preserves ratio (verification: manual test)
- [ ] Slider UI with presets visible only when CAS SKUs present (verification: manual test)

## Phases

1. **Backend** - migration (quotes.base_usage_ratio, quote_items.ratio_factor), types, edge function ratio logic, pricing lib helpers
2. **Frontend** - QuoteBuilder slider UI with presets, Calculator preview, QuoteCompare/Quotes display
3. **Tests** - unit tests for ratio math, non-CAS passthrough, reference constants
