# Forecast Wizard — Specification

## Goal

Add a guided wizard at `/forecast/wizard` as the primary forecast-to-quote flow. Keep existing pages (`/forecast`, `/forecast/yearly`, `/forecast/timeseries`) accessible for power users under a collapsible "Advanced" section in the sidebar.

### Problem Statement

The current forecast-to-quote flow has significant UX friction:
- 3 disconnected entry points with no guidance on which to use
- 4-step workflow on YearlyForecastPage isn't well-signposted
- Quote type decision forced too early (before seeing any pricing)
- Pay-per-use auto-generates with no review step
- No back-navigation from QuoteBuilder to forecast
- Scenario selection lacks context (no year labels, no cost preview)

### Solution

A single guided wizard page that walks users through the most common path (Yearly Input -> Scenarios -> Quote Configuration -> Generate Quote) with clear Back/Next navigation, inline configuration (no modal dialogs), and a review step before committing.

---

## Files to Create/Modify

### 1. `src/components/ui/wizard-stepper.tsx` — NEW (Small)

Reusable horizontal step indicator component.

- 4 circles connected by lines, showing: completed (checkmark), current (primary), upcoming (muted)
- Clicking a completed step navigates back; forward clicks blocked
- Props: `steps: {id, label, description}[]`, `currentStepIndex`, `completedStepIndices`, `onStepClick`
- Based on the existing `WorkflowIndicator` pattern in YearlyForecastPage (lines 77-134), made interactive and standalone

### 2. `src/hooks/useForecastSave.ts` — NEW (Small, ~120 lines)

Extract forecast save/update mutation from `YearlyForecastPage.tsx` (lines 342-475) into a reusable hook.

- `saveForecast({yearlyData, forecastName, description, customerId, forecastId, config})` returns forecast ID
- Handles: validation, `interpolateYearlyToMonthly()`, `calculatePeriodForecast()`, Supabase upsert, data point insertion
- Also exports `yearlyRowsToConfig()` and `configToYearlyRows()` helpers (currently lines 156-180 in YearlyForecastPage)
- Used by both wizard and existing YearlyForecastPage (refactor existing page to use hook too)

### 3. `src/pages/ForecastWizardPage.tsx` — NEW (Large, ~800-1000 lines)

The main wizard page with 4 steps. All state in `useState`, same pattern as YearlyForecastPage.

**Step 1 — Forecast Input:**
- Customer selector, forecast name, description (inline, not dialog)
- "Load Existing Forecast" dropdown at top (reuse query pattern from YearlyForecastPage)
- Embed `<YearlyForecastInput>` with `onSave={undefined}` (hides the component's save button — confirmed at line 458)
- Interpolated monthly summary card on the side

**Step 2 — Scenarios:**
- Scenario type cards inline: "One Per Year" vs "Consolidated" (pattern from CreateScenarioModal lines 366-422)
- Configuration: name prefix, consolidation strategy, custom values (pattern from CreateScenarioModal lines 427-518)
- Enhanced preview showing KPIs per scenario (SIMs, GB/SIM/yr, UDR, PCS, peak throughput)

**Step 3 — Review & Configure Quote:**
- Scenario summary table with year labels and full KPI context
- Quote type radio: Commitment vs Pay-per-Use (moved here from the early modal decision)
- If commitment + multi-scenario: `CommitmentModeSelector` + `CommitmentStrategyPicker` + term selector (reuse existing components)
- If commitment + yearly mode: `PerPeriodPreview` (reuse)
- `ManualSkuInput` for infrastructure SKUs (reuse)
- SKU mapping warning if mappings missing

**Step 4 — Summary & Generate:**
- Read-only summary cards: forecast info, scenarios, quote config
- "Generate Quote" button calls appropriate generator:
  - `generateMultiModeCommitmentQuote()` for commitment
  - `generatePerPeriodPayPerUseQuote()` for pay-per-use + multi-scenario
  - `generatePayPerUseQuote()` for pay-per-use + single scenario
- On success: navigate to `/quotes/${quoteId}`

**Step transitions:**
- Step 1 to 2: Validate data + auto-save forecast via `useForecastSave` hook
- Step 2 to 3: Generate scenarios via `handleCreateScenarios()` + `getScenariosByIds()`
- Step 3 to 4: Validate quote config
- Step 4 to done: Generate quote + navigate to QuoteBuilder
- Back from Step 3 to 2: Confirmation dialog (scenarios will be discarded)

**Bottom navigation bar:** Back/Next buttons with contextual labels ("Next", "Create Scenarios", "Configure Quote", "Generate Quote") and loading states.

### 4. `src/App.tsx` — MODIFY (Small, +3 lines)

- Import `ForecastWizardPage`
- Add route: `<Route path="/forecast/wizard" element={<ForecastWizardPage />} />` after line 57

### 5. `src/components/layout/Sidebar.tsx` — MODIFY (Medium, +40 lines)

Restructure forecast navigation:

**Before:**
```
Forecast        -> /forecast
Time-Series     -> /forecast/timeseries
Yearly Input    -> /forecast/yearly
```

**After:**
```
Forecast        -> /forecast/wizard          (main entry, changed href)
  > Advanced (collapsible sub-menu)
    Quick Evaluator   -> /forecast
    Yearly Input      -> /forecast/yearly
    Time-Series       -> /forecast/timeseries
```

Changes:
- Line 34: Change href from `/forecast` to `/forecast/wizard`
- Lines 35-36: Remove Time-Series and Yearly Input from main `navigation` array
- Add `forecastAdvancedNavigation` array with the 3 removed items
- Add `forecastExpanded` state (like existing `adminExpanded`)
- Render collapsible sub-menu after the Forecast nav item (same pattern as Admin section lines 91-135)
- `isActive` for Forecast item: match `/forecast/wizard` and `/forecast` prefix

### 6. `src/pages/YearlyForecastPage.tsx` — MODIFY (Small, optional)

Refactor to use the new `useForecastSave` hook instead of inline mutation logic. Eliminates code duplication.

---

## Reused Components (no changes needed)

| Component | Source | Used in Step |
|-----------|--------|-------------|
| `YearlyForecastInput` | `src/components/YearlyForecastInput.tsx` | 1 |
| `CommitmentStrategyPicker` | `src/components/CommitmentStrategyPicker.tsx` | 3 |
| `CommitmentModeSelector` | `src/components/CommitmentStrategyPicker.tsx` | 3 |
| `PerPeriodPreview` | `src/components/CommitmentStrategyPicker.tsx` | 3 |
| `ManualSkuInput` | `src/components/ManualSkuInput.tsx` | 3 |

## Reused Business Logic (no changes needed)

| Function | Source |
|----------|--------|
| `handleCreateScenarios()` | `src/lib/scenario-generator.ts` |
| `getScenariosByIds()` | `src/lib/scenario-generator.ts` |
| `generateMultiModeCommitmentQuote()` | `src/lib/quote-generator.ts` |
| `generatePerPeriodPayPerUseQuote()` | `src/lib/quote-generator.ts` |
| `generatePayPerUseQuote()` | `src/lib/quote-generator.ts` |
| `generateCommitmentPreview()` | `src/lib/quote-generator.ts` |
| `extractYearsFromScenarios()` | `src/lib/quote-generator.ts` |
| `interpolateYearlyToMonthly()` | `src/lib/timeseries-pricing.ts` |
| `calculatePeriodForecast()` | `src/lib/timeseries-pricing.ts` |

---

## Implementation Order

1. `wizard-stepper.tsx` — No dependencies, pure UI
2. `useForecastSave.ts` — Extract from YearlyForecastPage
3. `ForecastWizardPage.tsx` — Build incrementally (Step 1, then 2, then 3, then 4)
4. `App.tsx` — Add route
5. `Sidebar.tsx` — Restructure nav
6. `YearlyForecastPage.tsx` — Refactor to use shared hook (optional cleanup)

## Task Distribution for Subagents

| Task | Agent | Parallelizable |
|------|-------|---------------|
| WizardStepper component | Frontend UI | Yes (batch 1) |
| useForecastSave hook | Frontend UI | Yes (batch 1) |
| ForecastWizardPage (Steps 1-2) | Frontend UI | After batch 1 |
| ForecastWizardPage (Steps 3-4) | Frontend UI | After Steps 1-2 |
| App.tsx route + Sidebar.tsx nav | Frontend UI | Yes (batch 1) |
| YearlyForecastPage refactor | Frontend UI | After hook |
| Visual QA | QA | After all code |

---

## Verification

1. `npm run build` — TypeScript check passes, no compilation errors
2. `npm run dev` — Start dev server
3. Navigate to `/forecast/wizard` — wizard loads with Step 1 active
4. Enter yearly data, click Next — forecast auto-saves, Step 2 loads
5. Configure scenarios, click "Create Scenarios" — scenarios generated, Step 3 loads
6. Select quote type + commitment config, click "Configure Quote" — Step 4 loads
7. Click "Generate Quote" — quote created, redirects to QuoteBuilder with data
8. Verify sidebar: "Forecast" points to wizard, "Advanced" collapsible shows 3 original pages
9. Verify existing pages still work: `/forecast`, `/forecast/yearly`, `/forecast/timeseries`
10. Test back navigation: Step 3 to 2 shows confirmation, Step 2 to 1 works freely
11. Test load existing forecast: dropdown populates, selecting loads data into Step 1
