# Plan: Yearly Forecast Direct Input

**Created:** 2026-01-25
**Status:** ✅ Completed (2026-01-25)

## Objective

Enable direct input of yearly forecast data (end-of-year SIMs and total data usage) in the app, create forecast scenarios from this input, and use them for different quote calculations (pay-per-use, commitment).

## Current State

### What Exists
- Time-series forecast system with Excel upload (`src/pages/TimeSeriesForecast.tsx`)
- Forecast calculation engine (`src/lib/timeseries-pricing.ts`)
- Database tables: `timeseries_forecasts`, `timeseries_forecast_data`
- Quote Builder with forecast integration (`src/pages/QuoteBuilder.tsx`)
- SKU mapping configuration (`forecast_sku_mappings` table, `src/pages/admin/ForecastMapping.tsx`)

### Gaps for This Use Case
- No direct manual input for yearly forecast values (only Excel upload exists)
- Input expects "GB per SIM" but user has "total data usage"
- Need clearer workflow: yearly forecast → scenario → quote types

---

## Implementation Plan

### Phase 1: Direct Yearly Forecast Input UI

| Task | Description | Files | Subagent |
|------|-------------|-------|----------|
| 1.1 | Create `YearlyForecastInput` component with table UI for entering year, end-of-year SIMs, and total data usage (GB) per row | `src/components/YearlyForecastInput.tsx` | `general-purpose` |
| 1.2 | Add calculation logic to derive GB/SIM from total data usage ÷ SIMs | `src/lib/timeseries-pricing.ts` | `general-purpose` |
| 1.3 | Add linear interpolation function to expand yearly data to monthly granularity | `src/lib/timeseries-pricing.ts` | `general-purpose` |
| 1.4 | Integrate with existing `timeseries_forecasts` storage, setting granularity to "yearly" (with interpolated monthly data available) | `src/pages/TimeSeriesForecast.tsx` or new page | `general-purpose` |

### Phase 2: Forecast Scenario Generation

| Task | Description | Files | Subagent |
|------|-------------|-------|----------|
| 2.1 | Add scenario creation modal with choice: "One scenario per year" OR "Consolidated scenario" | New component/modal | `general-purpose` |
| 2.2 | Implement per-year scenario generation (creates N scenarios for N years) | Utility functions | `general-purpose` |
| 2.3 | Implement consolidated scenario generation (peak/avg/custom across all years) | Utility functions | `general-purpose` |
| 2.4 | Add scenario selection UI to choose which scenario(s) to use for quote generation | New component or modal | `general-purpose` |

### Phase 3: Quote Type Selection & Calculation

| Task | Description | Files | Subagent |
|------|-------------|-------|----------|
| 3.1 | Add quote type selector (Pay-per-Use vs Commitment) when creating quote from forecast | `src/pages/QuoteBuilder.tsx` | `general-purpose` |
| 3.2 | For Pay-per-Use: Create quote with monthly pricing based on forecast KPIs | Pricing logic updates | `general-purpose` |
| 3.3 | For Commitment: Add commitment strategy picker (peak/avg/P90) and term selection, apply volume+term discounts | `src/pages/QuoteBuilder.tsx` | `general-purpose` |
| 3.4 | Wire up the full flow: Yearly Input → Scenario → Quote Type → Generated Quote | Integration work | `general-purpose` |

### Phase 4: Testing & Validation

| Task | Description | Subagent |
|------|-------------|----------|
| 4.1 | Test the full workflow with sample yearly data | `Bash` |
| 4.2 | Validate pricing calculations match expected outputs | `general-purpose` |

---

## Task Dependencies

```
Phase 1:
1.1 ──┐
1.2 ──┼──▶ 1.4
1.3 ──┘

Phase 2 (depends on Phase 1):
      ┌──▶ 2.2 ──┐
2.1 ──┤          ├──▶ 2.4
      └──▶ 2.3 ──┘

Phase 3 (depends on Phase 2):
      ┌──▶ 3.2 ──┐
3.1 ──┤          ├──▶ 3.4
      └──▶ 3.3 ──┘

Phase 4 (depends on Phase 3):
3.4 ──▶ 4.1 ──▶ 4.2
```

**Parallelizable tasks:**
- 1.1, 1.2, 1.3 can run in parallel
- 2.2, 2.3 can run in parallel
- 3.2, 3.3 can run in parallel

---

## Decisions

- **Scenario mapping:** Both options available - user can choose one scenario per year OR a single consolidated scenario
- **Interpolation:** Yes, linear interpolation - spread yearly growth evenly across 12 months
- **Commitment terms:** Flexible (1-60 months) - use full range already supported in quote builder

---

## Technical Notes

### Input Format Expected
```
Year | End-of-Year SIMs | Total Data Usage (GB)
2026 | 100,000          | 1,900,000
2027 | 150,000          | 3,000,000
2028 | 200,000          | 4,500,000
```

### Derived Calculation
```
GB per SIM = Total Data Usage / Total SIMs
Example: 1,900,000 GB / 100,000 SIMs = 19 GB/SIM/year
Monthly: 19 / 12 ≈ 1.58 GB/SIM/month
```

### Linear Interpolation (Yearly → Monthly)
```
Given: Year 2026 = 100,000 SIMs, Year 2027 = 150,000 SIMs
Monthly increment = (150,000 - 100,000) / 12 = 4,167 SIMs/month

Jan 2027: 100,000 + (1 × 4,167) = 104,167
Feb 2027: 100,000 + (2 × 4,167) = 108,334
...
Dec 2027: 150,000 (end-of-year value)
```

### Database Integration
- Store in `timeseries_forecasts` with `granularity: 'yearly'`
- Each row becomes entry in `timeseries_forecast_data` with `period_date` set to year-end (e.g., 2026-12-31)

---

## Deployment Notes

### Migrations Required (run in order)
1. `004_forecast_scenarios.sql` - Forecast scenarios and SKU mappings
2. `005_timeseries_forecasts.sql` - Time-series tables
3. `006_yearly_forecast_config.sql` - Config column for yearly data
4. `007_quote_type.sql` - Quote type (commitment/pay-per-use)

### Edge Function
- `calculate-pricing` must be deployed with `--no-verify-jwt`
- CORS headers must include `apikey` and `x-client-info`
- `quote_history` trigger must be dropped if `change_type` / `action` columns are missing

### Setup Commands
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy calculate-pricing --no-verify-jwt
```

---

## Files Created/Modified

### New Files
- `src/components/YearlyForecastInput.tsx` - Table UI for yearly data entry
- `src/components/CreateScenarioModal.tsx` - Scenario creation with per-year/consolidated choice
- `src/components/ScenarioSelectionModal.tsx` - Multi-select scenarios for quotes
- `src/components/CommitmentStrategyPicker.tsx` - Strategy picker (peak/avg/specific year)
- `src/components/ui/radio-group.tsx` - RadioGroup UI component
- `src/pages/YearlyForecastPage.tsx` - Full page at `/forecast/yearly`
- `src/lib/scenario-generator.ts` - Scenario generation logic
- `src/lib/quote-generator.ts` - Quote generation for both pricing types
- `supabase/migrations/006_yearly_forecast_config.sql`
- `supabase/migrations/007_quote_type.sql`
- `supabase/config.toml` - Edge function configuration
- `tests/pricing/validation-calculations.test.ts` - 40 validation tests

### Modified Files
- `src/App.tsx` - Added `/forecast/yearly` route
- `src/components/layout/Sidebar.tsx` - Added "Yearly Input" nav item
- `src/pages/QuoteBuilder.tsx` - Quote type selector, commitment strategy, term picker
- `src/pages/ForecastEvaluator.tsx` - Scenario selection integration
- `src/lib/timeseries-pricing.ts` - GB/SIM calculation, interpolation functions
- `src/types/database.ts` - QuoteType, YearlyForecastConfig types
- `supabase/functions/calculate-pricing/index.ts` - CORS headers fix
