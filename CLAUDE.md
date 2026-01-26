# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start Vite dev server on http://localhost:5173
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run test         # Unit tests in watch mode (Vitest)
npm run test:run     # Unit tests single run
npm run test:coverage # Unit tests with coverage report
npm run test:e2e     # Playwright E2E tests (auto-starts dev server)
npm run test:e2e:ui  # Playwright with interactive UI

# Run a single test file
npx vitest run tests/pricing/volume-pricing.test.ts

# Run tests matching a name pattern
npx vitest run -t "smooth mode"
```

## Architecture

**Enterprise B2B SaaS pricing engine** for telecom/infrastructure products. React 18 + TypeScript + Vite frontend with Supabase (PostgreSQL + Edge Functions) backend.

### Core Pricing Formula

```
Final Price = Base Price × Volume Factor × Term Factor × Env Factor
```

- **Volume discounts**: Exponential decay with geometric bounds (stepped/smooth/manual modes)
- **Term factors**: Linear interpolation between known commitment-length points, per SKU category (CAS/CNO/CCS/default)
- **Environment factors**: Production vs reference multipliers
- **Time-phased aggregation**: Weighted averaging across contract phases
- **Time-series pricing**: Pay-per-use (monthly) or fixed commitment (peak/avg/P90/P95)

### Key Source Directories

- `src/lib/` — Pure business logic: pricing algorithms, quote/scenario generation, Excel parsing, PDF export
- `src/pages/` — Route-level page components (20 pages)
- `src/pages/admin/` — Admin configuration pages (6 pages for pricing rules, term factors, base charges, etc.)
- `src/components/ui/` — Radix/Shadcn UI primitives
- `src/components/` — Domain-specific components (modals, uploaders, charts, pickers)
- `src/types/database.ts` — All TypeScript type definitions (~495 lines)
- `src/contexts/AuthContext.tsx` — Supabase auth state
- `tests/pricing/` — Unit tests for pricing algorithms
- `tests/e2e/` — Playwright E2E tests

### Forecast-to-Quote Flow

This is the primary multi-step workflow:

1. **YearlyForecastPage** — User enters yearly SIMs & data usage, saves to `timeseries_forecasts`
2. **CreateScenarioModal** — Generates per-year or consolidated scenarios, saves to `forecast_scenarios`
3. **ScenarioSelectionModal** — User picks scenarios + quote type (commitment vs pay-per-use)
4. **QuoteBuilder** — Receives scenario IDs via React Router state, renders commitment mode selector (max vs yearly) and strategy picker (peak/avg/specific year)
5. **Quote generation** — `generateMultiModeCommitmentQuote()` or `generatePerPeriodPayPerUseQuote()` from `src/lib/quote-generator.ts`

### State Management

- **Server state**: TanStack React Query (Supabase queries with caching)
- **Local state**: React useState/useReducer within page components
- **Auth**: Supabase Auth (Email + Google OAuth) wrapped in `AuthContext`, guarded by `ProtectedRoute`
- **Routing**: React Router DOM v6 with route state for passing data between pages

### Database

**Supabase PostgreSQL** with 7 migrations in `supabase/migrations/`. Edge function in `supabase/functions/calculate-pricing/`.

**Core tables**: `skus`, `customers`, `quotes`, `quote_packages`, `quote_items`
**Config tables**: `pricing_models`, `ladders`, `term_factors`, `base_charges`, `env_factors`, `perpetual_config`, `forecast_sku_mappings`
**Forecast tables**: `forecast_scenarios`, `timeseries_forecasts`, `timeseries_forecast_data`

### Key Enums (PostgreSQL)

- `pricing_mode`: stepped | smooth | manual
- `sku_category`: default | cas | cno | ccs
- `environment_type`: production | reference
- `quote_status`: draft | pending | sent | accepted | rejected | expired | ordered
- `package_status`: new | ordered | existing | cancelled

## Code Conventions

- Path alias: `@/*` maps to `./src/*` (use `@/components/...` not relative paths)
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Styling: Tailwind CSS with dark mode (class-based), custom HSL color variables
- Components: PascalCase filenames, one component per file
- Business logic lives in `src/lib/`, not in components

## Documentation

- `docs/SPECIFICATION.md` — Features and data model
- `docs/IMPLEMENTATION.md` — Technical architecture and algorithms
- `docs/PRICING-OVERVIEW.md` — Pricing algorithm explanation
