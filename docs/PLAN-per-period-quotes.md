# Plan: Per-Period Forecast-to-Quote Generation

## Summary

Modify quote generation from forecast scenarios with **two commitment modes** and pay-per-use:

- **Commitment — Max mode**: Single package committed to the **maximum** forecast value across all years, with the full contract term. Uses existing `CommitmentSizingStrategy` (peak/avg/P90/P95) to determine the commitment level.
- **Commitment — Yearly mode**: One package **per year**, each with a 12-month term, sized to that year's forecast values. Results in N packages for an N-year forecast.
- **Pay-per-use**: One package per month across the forecast, showing month-by-month charge outlook.

---

## Task Breakdown (Parallel Execution)

### Task 1: Core Quote Generation Functions
**File**: `src/lib/quote-generator.ts`
**Depends on**: Nothing (can start immediately)
**Parallel group**: A

Add the following to `quote-generator.ts`:

1. **`CommitmentMode` type**:
   ```typescript
   type CommitmentMode = 'max' | 'yearly'
   ```
   - `'max'`: Single package committed to the maximum forecast value across all scenarios, using the full contract term.
   - `'yearly'`: One package per year, each with a 12-month term, sized to that year's forecast.

2. **`groupScenariosByYear()` helper** — Groups `ForecastScenario[]` by year extracted from scenario name regex `\b(20\d{2})\b`. Returns `Map<number, ForecastScenario[]>` sorted by year.

3. **`scenariosToYearlyDataPoints()` helper** — Converts `ForecastScenario[]` to `YearlyDataPoint[]` (from `timeseries-pricing.ts`) for interpolation. Maps `total_sims` → `totalSims`, computes `totalDataUsageGb` from `total_sims * gb_per_sim`, extracts year from scenario name.

4. **`CommitmentQuoteOptions` interface** (replaces the old per-period-only interface):
   ```typescript
   {
     scenarios: ForecastScenario[]
     customerId?: string
     commitmentMode: CommitmentMode
     strategy: CommitmentSizingStrategy    // used by 'max' mode (peak/avg/P90/P95)
     termMonths?: number                   // full contract term (e.g., 36)
     title?: string
     notes?: string
   }
   ```

5. **Update `CommitmentQuoteResult` interface** — Add `packageIds: string[]` and `packageCount: number`. Keep `packageId` (first package) for backward compat.

6. **`generateMaxCommitmentQuote()` function** (mode: `'max'`):
   - Aggregates all scenarios to find the **maximum** KPI values across the entire forecast (respecting `strategy` — e.g., peak takes the highest single value, P90 takes the 90th percentile across years)
   - Creates a single quote record (`quote_type: 'commitment'`, `use_aggregated_pricing: true`)
   - Creates **one package** with `term_months` = `termMonths` (full contract term, e.g., 36)
   - Line items reflect the max commitment values via `mapValuesToKpis()` + `fetchSkuMappings()`
   - Triggers `calculate-pricing` edge function
   - Returns `CommitmentQuoteResult` with single package ID

7. **`generateYearlyCommitmentQuote()` function** (mode: `'yearly'`):
   - Groups scenarios by year using `groupScenariosByYear()`
   - Creates single quote record (`quote_type: 'commitment'`, `use_aggregated_pricing: true`)
   - For each year: creates package `"Year N - YYYY"` with `term_months = 12`
   - For each package: creates line items from that year's scenario KPI values via `mapValuesToKpis()` + `fetchSkuMappings()`
   - Triggers `calculate-pricing` edge function
   - Returns `CommitmentQuoteResult` with all package IDs

8. **`generateCommitmentQuote()` dispatcher**:
   - Accepts `CommitmentQuoteOptions`
   - Routes to `generateMaxCommitmentQuote()` or `generateYearlyCommitmentQuote()` based on `commitmentMode`
   - Single scenario always falls back to existing single-package behavior regardless of mode

9. **`generatePerPeriodPayPerUseQuote()` function**:
   - Converts scenarios to `YearlyDataPoint[]` via `scenariosToYearlyDataPoints()`
   - Interpolates to monthly via `interpolateYearlyToMonthly()` from `timeseries-pricing.ts`
   - For each month: calculates KPI outputs via `calculatePeriodForecast()`, creates package `"Mon YYYY"` with `term_months = 1`
   - Creates line items per package from KPI values via SKU mappings
   - Uses `use_aggregated_pricing: false`
   - Triggers pricing calculation
   - Extracts forecast config from first scenario (`take_rate_pcs_udr`, `take_rate_ccs_udr`, etc.)

---

### Task 2: QuoteBuilder Integration
**File**: `src/pages/QuoteBuilder.tsx`
**Depends on**: Task 1 (needs the new exported functions)
**Parallel group**: B

1. **Import new functions**: `generateCommitmentQuote`, `generatePerPeriodPayPerUseQuote` from `quote-generator.ts`

2. **Add state for commitment mode** (near line ~138):
   ```typescript
   const [commitmentMode, setCommitmentMode] = useState<CommitmentMode>('max')
   ```

3. **Update `createQuote` mutation** (line ~306):
   - When `hasMultipleScenarios && formData.quote_type === 'commitment'`: call `generateCommitmentQuote()` with `commitmentMode` and `strategy`
   - When `hasMultipleScenarios && formData.quote_type === 'pay_per_use'`: call `generatePerPeriodPayPerUseQuote()`
   - Update success toast messages to reflect package counts (e.g., "Created quote with 1 package" vs "Created quote with 3 yearly packages")

4. **Add commitment mode selector** (lines ~1070-1139, before the strategy picker):
   - **Radio group** with two options when `hasMultipleScenarios`:
     - **"Max commitment"** (default): "Single package committed to the peak forecast value across all years. Full contract term applied."
     - **"Yearly commitment"**: "Separate package per year, each sized to that year's forecast. 12-month term per package."
   - When `commitmentMode === 'max'`: **keep** the existing `CommitmentStrategyPicker` (peak/avg/P90/P95) and term selector visible — user picks how to aggregate across years
   - When `commitmentMode === 'yearly'`: **replace** the strategy picker with the `PerPeriodPreview` component (from Task 4) showing a per-year breakdown table
   - Single-scenario quotes: hide the mode selector entirely, use existing single-package flow

5. **Add pay-per-use multi-scenario section** (after line ~1139):
   - When `isNew && fromForecast && hasMultipleScenarios && formData.quote_type === 'pay_per_use'`: show info card:
     - "Creating monthly packages across the forecast period (N months)"
     - "Each month shows forecasted charges without commitment"

---

### Task 3: ScenarioSelectionModal Hints
**File**: `src/components/ScenarioSelectionModal.tsx`
**Depends on**: Nothing (can start immediately)
**Parallel group**: A

1. **Add contextual hint below quote type description** (after line ~347):
   - When `quoteType === 'commitment'` and `selectedIds.size > 1`: show hint `"Commitment mode (max vs. yearly) can be configured on the next screen."`
   - When `quoteType === 'pay_per_use'` and `selectedIds.size > 1`: show hint `"Monthly packages will be created showing month-by-month charges across the forecast period."`

2. **Calculate and display the total months** in the summary footer (line ~367):
   - For commitment: `"N years of forecast selected"`
   - For pay-per-use: `"~N monthly packages"`
   - Extract years from selected scenarios to compute these numbers

---

### Task 4: CommitmentStrategyPicker + PerPeriodPreview
**File**: `src/components/CommitmentStrategyPicker.tsx`
**Depends on**: Nothing (can start immediately)
**Parallel group**: A

1. **Keep `CommitmentStrategyPicker` unchanged** — It remains used in **max commitment mode** where the user selects peak/avg/P90/P95 to determine how to aggregate across years into a single commitment value.

2. **Export a new `PerPeriodPreview` component** for use in **yearly commitment mode**:
   - Read-only informational display (no user interaction)
   - Shows a table: Year | SIMs | GB/SIM | UDR | PCS with values from each year's scenario
   - Summary line: "N packages will be created, each with a 12-month commitment term"
   - Accepts `scenarios: ForecastScenario[]` and groups them by year internally using `groupScenariosByYear()` from Task 1

3. **Export a `CommitmentModeSelector` component**:
   - Radio group with two options: "Max commitment" and "Yearly commitment"
   - Each option has a short description explaining the resulting package structure
   - Props: `value: CommitmentMode`, `onChange: (mode: CommitmentMode) => void`, `yearCount: number`
   - Only rendered when `hasMultipleScenarios` — single-scenario quotes skip this entirely

---

## Parallel Execution Plan

```
Group A (start immediately, in parallel):
  ├── Task 1: Core functions in quote-generator.ts (CommitmentMode, max + yearly + pay-per-use generators)
  ├── Task 3: ScenarioSelectionModal hints
  └── Task 4: CommitmentModeSelector + PerPeriodPreview components

Group B (after Group A completes):
  └── Task 2: QuoteBuilder integration (mode selector UI, conditional strategy picker vs. preview)
```

**Tasks 1, 3, and 4 can all run in parallel** since they modify different files with no interdependencies.

**Task 2 must wait** for Task 1 (needs the new exported functions) and Task 4 (uses the updated component).

---

## Key Files Reference

| File | Task | Changes |
|------|------|---------|
| `src/lib/quote-generator.ts` | 1 | `CommitmentMode` type, `generateMaxCommitmentQuote`, `generateYearlyCommitmentQuote`, dispatcher, helpers |
| `src/lib/timeseries-pricing.ts` | — | No changes (existing `interpolateYearlyToMonthly` + `calculatePeriodForecast` reused) |
| `src/pages/QuoteBuilder.tsx` | 2 | Mode selector integration, conditional strategy picker vs. yearly preview |
| `src/components/ScenarioSelectionModal.tsx` | 3 | Contextual hints |
| `src/components/CommitmentStrategyPicker.tsx` | 4 | Unchanged; + new `PerPeriodPreview` + `CommitmentModeSelector` |
| `supabase/functions/calculate-pricing/` | — | No changes needed |

---

## Edge Cases

- **Single scenario**: Falls back to existing single-package behavior regardless of commitment mode selection (mode selector hidden)
- **No year in scenario name**: Grouped under "Period N" by creation order
- **Multiple scenarios same year**: In yearly mode, aggregate within that year. In max mode, included in the cross-year max calculation
- **Max mode with strategy**: Peak = highest single year's value; Avg = average across years; P90/P95 = percentile across yearly values
- **Yearly mode term**: Each package always gets `term_months = 12` — no term selector needed (the term is inherently 1 year)
- **Max mode term**: Single package gets full contract term (e.g., `term_months = 36` for a 3-year forecast)
- **`use_aggregated_pricing`**: `true` for commitment (both modes), `false` for pay-per-use
- **Many monthly packages**: 60 packages for 5-year forecast — QuoteBuilder already handles collapsible sections

---

## Verification

1. Create 3-year annual forecast → Generate per-year scenarios
2. Select all → Commitment → **Max mode** → Select "Peak" strategy → Verify **1 package** with 36-month term, values = max across years
3. Select all → Commitment → **Max mode** → Select "Avg" strategy → Verify **1 package** with values = average across years
4. Select all → Commitment → **Yearly mode** → Verify **3 packages** (Year 1-3, 12-month term each), each sized to its year's forecast
5. Select all → Pay-per-Use → Verify **36 monthly packages**
6. Calculate pricing on all variants → Verify discounts apply correctly (36mo term discount for max mode, 12mo for yearly)
7. Single scenario → Commitment → Verify mode selector hidden, single package created (existing behavior)
8. Run `npm run test:run` — no regressions
9. Export PDF — verify multi-package rendering for both modes
