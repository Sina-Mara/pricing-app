# Pricing App - Agent Context

Enterprise B2B SaaS pricing engine and quote management system.

## Quick Start
```bash
npm run dev      # Start dev server (port 5173)
npm run test:run # Run 95 unit tests
npm run build    # Production build
```

## Documentation
- **Specification**: `docs/SPECIFICATION.md` - Features, data model, capabilities
- **Implementation**: `docs/IMPLEMENTATION.md` - Algorithms, schema, architecture

## Key Files

### Pricing Logic
- `src/lib/pricing.ts` - Core pricing algorithms (volume, term, env factors)
- `src/lib/timeseries-pricing.ts` - Time-series pricing (pay-per-use, fixed commitment)
- `src/lib/excel-parser.ts` - Excel import with date format detection

### Main Pages
- `src/pages/QuoteBuilder.tsx` - Quote creation/editing with packages
- `src/pages/TimeSeriesForecast.tsx` - Excel import for time-series forecasts
- `src/pages/ForecastEvaluator.tsx` - License requirement calculator
- `src/pages/admin/` - Admin configuration pages

### Database
- `supabase/migrations/` - 5 migration files (001-005)
- `supabase/functions/calculate-pricing/` - Edge function for pricing

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS + Shadcn UI (Radix)
- TanStack React Query
- Supabase (PostgreSQL + Auth)
- Vitest + Playwright

## Data Model
**Core**: `skus`, `customers`, `quotes`, `quote_packages`, `quote_items`
**Config**: `pricing_models`, `ladders`, `term_factors`, `base_charges`, `env_factors`, `perpetual_config`
**Time-Series**: `timeseries_forecasts`, `timeseries_forecast_data`

## Pricing Capabilities
- Volume pricing (stepped/smooth modes with geometric bounds)
- Term discounts (interpolated by commitment length)
- Environment factors (production vs reference)
- Time-phased aggregation (weighted across contract phases)
- Perpetual licensing alternative
- Time-series: pay-per-use (monthly) or fixed commitment (peak/avg/P90/P95)

## Testing
- Unit tests: `tests/pricing/` (95 tests covering pricing algorithms)
- E2E tests: `tests/e2e/` (Playwright)
