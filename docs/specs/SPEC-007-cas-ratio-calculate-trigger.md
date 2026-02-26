# SPEC-007: CAS Ratio Slider — Calculate Trigger

**Status:** decomposed
**Created:** 2026-02-26

## Problem

After making the CAS ratio slider sticky (SPEC-006), two gaps remain: the Calculate button scrolls out of view with the page header, and changing the ratio does not trigger auto-calculate (only `updateLineItem` mutations do). Users cannot recalculate after a ratio change without scrolling back up.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Add Calculate button inside the sticky CAS bar | Zero architecture change — reuse existing `calculatePricing` function |
| D2 | Debounced useEffect on `base_usage_ratio` → `calculatePricing` when `autoCalculate` on | Matches existing 1.5s debounce pattern; `calculatePricing` already saves form data before calling edge function |

## Guardrails

- **MUST:** Auto-calculate only fires when `autoCalculate` toggle is enabled
- **MUST:** Debounce ≥ 1s to avoid thrashing the edge function while dragging the slider
- **MUST NOT:** Add a second Calculate button to the original header (keep single source of truth in the sticky bar)
- **SHOULD:** Button shows "Calculating..." / disabled state during calculation

## Acceptance

- [x] Calculate button visible in sticky bar while SKUs are in view
- [x] Clicking Calculate saves ratio + triggers edge function recalculation
- [x] With Auto-calculate on: dragging ratio slider recalculates after ~1.5s
- [x] With Auto-calculate off: no recalculation until Calculate is clicked

## Phases

1. **Sticky bar button** — add Calculate button to sticky CAS div in QuoteBuilder.tsx
2. **Ratio auto-calculate** — add `useEffect` debounce on `base_usage_ratio` that calls `calculatePricing` when `autoCalculate` is true
