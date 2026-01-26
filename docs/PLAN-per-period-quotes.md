# Plan: Per-Period Forecast-to-Quote Generation

## Summary

Modify quote generation from forecast scenarios:
- **Commitment**: One package per year (12-month term each), with user-selectable term discount mode
- **Pay-per-use**: One package per month across the forecast, showing month-by-month charge outlook

---

## Task Breakdown (Parallel Execution)

### Task 1: Core Quote Generation Functions
**File**: `src/lib/quote-generator.ts`
**Depends on**: Nothing (can start immediately)
**Parallel group**: A

Add the following to `quote-generator.ts`:

1. **`groupScenariosByYear()` helper** — Groups `ForecastScenario[]` by year extracted from scenario name regex `\b(20\d{2})\b`. Returns `Map<number, ForecastScenario[]>` sorted by year.

2. **`scenariosToYearlyDataPoints()` helper** — Converts `ForecastScenario[]` to `YearlyDataPoint[]` (from `timeseries-pricing.ts`) for interpolation. Maps `total_sims` → `totalSims`, computes `totalDataUsageGb` from `total_sims * gb_per_sim`, extracts year from scenario name.

3. **`PerPeriodCommitmentQuoteOptions` interface**:
   ```typescript
   {
     scenarios: ForecastScenario[]
     customerId?: string
     termMonthsPerPeriod?: number         // default: 12
     useContractTotalForDiscount?: boolean // if true, packages get total contract term
     strategy: CommitmentSizingStrategy
     title?: string
     notes?: string
   }
   ```

4. **Update `CommitmentQuoteResult` interface** — Add `packageIds: string[]` and `packageCount: number`. Keep `packageId` (first package) for backward compat.

5. **`generatePerPeriodCommitmentQuote()` function**:
   - Groups scenarios by year using `groupScenariosByYear()`
   - Creates single quote record (`quote_type: 'commitment'`, `use_aggregated_pricing: true`)
   - For each year: creates package `"Year N - YYYY"` with `term_months` = `termMonthsPerPeriod` (or total contract length if `useContractTotalForDiscount`)
   - For each package: creates line items from that year's scenario KPI values via `mapValuesToKpis()` + `fetchSkuMappings()`
   - Triggers `calculate-pricing` edge function
   - Returns `CommitmentQuoteResult` with all package IDs

6. **`generatePerPeriodPayPerUseQuote()` function**:
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

1. **Import new functions**: `generatePerPeriodCommitmentQuote`, `generatePerPeriodPayPerUseQuote` from `quote-generator.ts`

2. **Add state for term discount mode** (near line ~138):
   ```typescript
   const [useContractTotalForDiscount, setUseContractTotalForDiscount] = useState(false)
   ```

3. **Update `createQuote` mutation** (line ~306):
   - When `hasMultipleScenarios && formData.quote_type === 'commitment'`: call `generatePerPeriodCommitmentQuote()` with `useContractTotalForDiscount` flag
   - When `hasMultipleScenarios && formData.quote_type === 'pay_per_use'`: call `generatePerPeriodPayPerUseQuote()` instead of standard single-package creation
   - Update success toast messages to reflect package counts

4. **Replace commitment strategy/term picker section** (lines ~1070-1139):
   - Replace the `CommitmentStrategyPicker` + term selector with a **per-year preview card** showing:
     - "N-year forecast — creating N packages (12-month commitment each)"
     - Table of years with key metrics (SIMs, GB/SIM from each scenario)
   - Add **term discount toggle**: "Per-package (12mo)" vs "Total contract (Nmo)" with description
   - Remove strategy picker entirely (each year maps to its own scenario directly)

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
   - When `quoteType === 'commitment'` and `selectedIds.size > 1`: show hint `"Each year will create a separate 12-month commitment package."`
   - When `quoteType === 'pay_per_use'` and `selectedIds.size > 1`: show hint `"Monthly packages will be created showing month-by-month charges across the forecast period."`

2. **Calculate and display the total months** in the summary footer (line ~367):
   - For commitment: `"N year-packages (12-month term each)"`
   - For pay-per-use: `"~N monthly packages"`
   - Extract years from selected scenarios to compute these numbers

---

### Task 4: CommitmentStrategyPicker Per-Period Mode
**File**: `src/components/CommitmentStrategyPicker.tsx`
**Depends on**: Nothing (can start immediately)
**Parallel group**: A

1. **Add `perPeriodMode` prop** to the component:
   - When `perPeriodMode=true`, render a simplified read-only summary instead of the strategy radio buttons
   - Show a table: Year | SIMs | GB/SIM | UDR | PCS with values from each scenario
   - No user interaction needed — just informational display

2. **Export the per-period preview as a separate component** `PerPeriodPreview` that can be used independently in QuoteBuilder if needed.

---

## Parallel Execution Plan

```
Group A (start immediately, in parallel):
  ├── Task 1: Core functions in quote-generator.ts
  ├── Task 3: ScenarioSelectionModal hints
  └── Task 4: CommitmentStrategyPicker per-period mode

Group B (after Group A completes):
  └── Task 2: QuoteBuilder integration (depends on Task 1's exports + Task 4's component)
```

**Tasks 1, 3, and 4 can all run in parallel** since they modify different files with no interdependencies.

**Task 2 must wait** for Task 1 (needs the new exported functions) and Task 4 (uses the updated component).

---

## Key Files Reference

| File | Task | Changes |
|------|------|---------|
| `src/lib/quote-generator.ts` | 1 | New functions + types |
| `src/lib/timeseries-pricing.ts` | — | No changes (existing `interpolateYearlyToMonthly` + `calculatePeriodForecast` reused) |
| `src/pages/QuoteBuilder.tsx` | 2 | Integration, UI replacement |
| `src/components/ScenarioSelectionModal.tsx` | 3 | Contextual hints |
| `src/components/CommitmentStrategyPicker.tsx` | 4 | Per-period mode |
| `supabase/functions/calculate-pricing/` | — | No changes needed |

---

## Edge Cases

- **Single scenario**: Falls back to existing behavior (single package)
- **No year in scenario name**: Grouped under "Period N" by creation order
- **Multiple scenarios same year**: Apply aggregation strategy within that year
- **Total contract term discount**: All packages get `term_months` = total (e.g., 36) so pricing engine applies higher discount
- **`use_aggregated_pricing`**: `true` for commitment (cross-package volume discounts), `false` for pay-per-use
- **Many monthly packages**: 60 packages for 5-year forecast — QuoteBuilder already handles collapsible sections

---

## Verification

1. Create 3-year annual forecast → Generate per-year scenarios
2. Select all → Commitment → Verify 3 packages (Year 1-3, 12mo term each)
3. Toggle "total contract term" → Verify packages get 36mo term
4. Select all → Pay-per-Use → Verify 36 monthly packages
5. Calculate pricing on both → Verify discounts apply correctly
6. Run `npm run test:run` — no regressions
7. Export PDF — verify multi-package rendering
