# SPEC-025: Payment Schedule Dates and Savings Totals

**Status:** ready
**Created:** 2026-08-25

## Problem

The Payment Schedule section (added in SPEC-023 D9) lists periods as generic "Month 1", "Quarter 1", "Year 1", etc., with no calendar anchor, and no visible total — a reader can't see what date a given payment is actually due, nor how much a cadence choice actually saves them.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Contract start date is **not persisted**. It's collected via a small dialog when "Export PDF" is clicked in `QuoteBuilder.tsx`, defaulting to today's date, editable before generating | Confirmed: simpler than a schema change, no migration, re-enterable per export if the actual start shifts |
| D2 | `generateQuotePDF(quote, startDate)` takes the date as a required second argument; each period's row label switches from `"Month N"/"Quarter N"/"Year N"` to the calendar date of that payment (`startDate` + `(N-1) * tier.months` months), formatted with the existing `formatDate` util | Reuses existing date formatting for visual consistency with the rest of the document |
| D3 | Each cadence's table gets a bold **Total** row summing to that cadence's `discountedTotal` | Makes the aggregate cost of choosing that cadence visible without mental math |
| D4 | Each non-Monthly cadence shows a **"Total Saved (vs. Monthly)"** line: `Monthly discountedTotal − this cadence's discountedTotal`. Monthly itself shows no savings line (it's the baseline, saving = 0 by definition) | Confirmed: savings are measured against paying Monthly, not against the fully-undiscounted price |
| D5 | Month-adding for date math clamps day-of-month at month end (e.g. Jan 31 + 1 month → Feb 28/29) rather than overflowing into the next month | Standard calendar-math behavior; avoids e.g. Jan 31 + 1 month silently becoming Mar 3 |

## Guardrails

- **MUST NOT** write the start date to the `quotes` table or any other persisted store
- **MUST** compute Monthly's `discountedTotal` once and reuse it for every cadence's savings line (don't recompute per cadence)
- **SHOULD** default the export dialog's date input to today, but require it to be explicitly confirmed (not silently auto-submitted)

## Phases

1. **UI**: `QuoteBuilder.tsx` — small dialog on "Export PDF" click collecting a start date, wired to call `generateQuotePDF(quote, startDate)`
2. **PDF**: `pdf.ts` — add month-adding date helper; replace period labels with calendar dates; add per-tier Total row; add "Total Saved (vs. Monthly)" line for Quarterly/Annual
3. **Verify**: typecheck + manual PDF export check with a chosen start date, confirming dates roll forward correctly across a 36-month Monthly schedule and totals reconcile with the summary block above
