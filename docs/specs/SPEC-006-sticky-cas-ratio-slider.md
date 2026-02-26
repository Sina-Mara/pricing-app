# SPEC-006: Sticky CAS Ratio Slider on Quote Builder

**Status:** decomposed
**Created:** 2026-02-26

## Problem

The Base/Usage Ratio (CAS) slider lives inside the scrollable main content area of the Quote Builder. When users scroll down to view SKU line items, the slider scrolls out of view. This makes it impossible to adjust the ratio and observe the price impact on SKUs simultaneously.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Make the CAS ratio section `sticky top-0` within the scroll container | Minimal change, CSS-only, no state/component restructuring needed |
| D2 | Add background + border-bottom + z-index | Prevents transparency bleed-through when content scrolls beneath it |

## Guardrails

- **MUST:** Slider must remain fully interactive (range input, preset buttons) when sticky
- **MUST NOT:** Sticky bar should not cover the page header or sidebar
- **SHOULD:** Visual treatment should match the existing card/panel aesthetic

## Acceptance

- [x] CAS slider stays visible when scrolling down through packages/SKUs
- [x] Moving the slider while SKUs are visible updates prices in real-time
- [x] Sticky bar has a solid background (no bleed-through)
- [x] Does not appear on quotes without CAS SKUs

## Phases

1. **Sticky wrapper** - wrap the `hasCasSkus` block in `QuoteBuilder.tsx` with sticky positioning styles
