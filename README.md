# Pricing App

An enterprise-grade pricing engine and quote management system for B2B SaaS licensing. Supports multi-factor pricing (volume, term, environment), time-phased contract aggregation, perpetual licensing alternatives, and comprehensive admin configuration.

## Features

### Core Functionality
- **Dashboard** - Metrics overview with recent quotes and status breakdown
- **Quote Management** - Create, edit, and manage quotes with multiple packages
- **Quote Builder** - Visual editor with real-time pricing calculation and PDF export
- **Price Calculator** - Single-item pricing preview with parameter adjustments
- **Customer Management** - Full customer directory with CRUD operations
- **SKU Catalog** - Product catalog with pricing model information
- **Timeline Visualization** - Contract lifecycle Gantt view
- **Forecast Evaluator** - License requirement calculator
- **Time-Series Forecast** - Excel import with multi-period pricing (pay-per-use or fixed commitment)
- **Yearly Forecast Input** - Direct entry of yearly SIMs & data usage with linear interpolation to monthly
- **Scenario Generation** - Create per-year or consolidated forecast scenarios
- **Quote Type Selection** - Pay-per-Use (no commitment) vs Commitment (term + volume discounts) with strategy picker

### Admin Configuration
- **Pricing Models** - Configure algorithmic pricing (stepped, smooth, manual modes)
- **Term Factors** - Set commitment discount curves by category
- **Base Charges** - Manage fixed monthly recurring fees
- **Environment Factors** - Configure production vs reference pricing multipliers
- **Perpetual Config** - Set perpetual licensing parameters
- **Forecast Mapping** - Map forecast KPIs to SKUs for quote generation

### Pricing Engine Capabilities
| Capability | Description |
|------------|-------------|
| Volume Pricing | Stepped and smooth discount modes with geometric bounds |
| Term Discounts | Interpolated/extrapolated by commitment length |
| Environment Factors | Production vs development multipliers |
| Base Charges | Fixed MRC with optional term discount |
| Aggregated Pricing | Cross-package quantity aggregation |
| Time-Phased Aggregation | Weighted pricing across contract phases |
| Perpetual Alternative | License + maintenance calculation |
| Time-Series Pricing | Pay-per-use (monthly) or fixed commitment (peak/avg/P90/P95) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + Radix UI (Shadcn) |
| State | TanStack React Query |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| Auth | Supabase Auth (Email + Google OAuth) |
| Testing | Vitest (unit) + Playwright (E2E) |

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Sina-Mara/pricing-app.git
cd pricing-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Set up the database:
   - Create a new Supabase project
   - Run the migrations in `supabase/migrations/` in order
   - Deploy the edge function from `supabase/functions/calculate-pricing/`

5. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests (single run) |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:ui` | Run E2E tests with UI |

## Project Structure

```
pricing-app/
├── src/
│   ├── components/       # React components
│   │   ├── ui/          # Radix UI primitives
│   │   ├── layout/      # Layout components
│   │   ├── ExcelUploader.tsx      # Drag-drop file upload
│   │   └── TimeseriesChart.tsx    # Time-series visualizations
│   ├── contexts/        # React contexts (Auth)
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities & business logic
│   │   ├── pricing.ts            # Pricing algorithms
│   │   ├── excel-parser.ts       # Excel file parsing
│   │   ├── timeseries-pricing.ts # Time-series pricing + interpolation
│   │   ├── scenario-generator.ts # Forecast scenario generation
│   │   ├── quote-generator.ts    # Quote generation (PPU/commitment)
│   │   ├── supabase.ts           # Supabase client
│   │   └── utils.ts              # Formatting helpers
│   ├── pages/           # Page components
│   │   ├── TimeSeriesForecast.tsx # Time-series import page
│   │   └── admin/       # Admin pages
│   └── types/           # TypeScript definitions
├── supabase/
│   ├── migrations/      # Database schema (7 migrations)
│   ├── functions/       # Edge functions
│   └── config.toml      # Edge function configuration
├── tests/
│   ├── pricing/         # Unit tests (135 tests)
│   └── e2e/             # Playwright tests
└── docs/                # Documentation
```

## Documentation

- [Specification](docs/SPECIFICATION.md) - Features, data model, and agent guidelines
- [Implementation](docs/IMPLEMENTATION.md) - Technical architecture, algorithms, and database schema

## Testing

### Unit Tests
The pricing algorithms are thoroughly tested with 135 test cases:

```bash
npm run test:run
```

### E2E Tests
Playwright tests cover authentication and main workflows:

```bash
npm run test:e2e
```

## Database Schema

### Core Tables
- `skus` - Product catalog
- `customers` - Customer directory
- `quotes` - Quote headers
- `quote_packages` - Package containers with term
- `quote_items` - Line items with calculated pricing

### Configuration Tables
- `pricing_models` - Algorithmic pricing rules
- `ladders` - Manual price tiers
- `term_factors` - Commitment discounts by category
- `base_charges` - Fixed monthly fees
- `env_factors` - Environment multipliers
- `perpetual_config` - Perpetual licensing parameters
- `forecast_sku_mappings` - KPI to SKU mappings for forecasting

### Forecast & Scenario Tables
- `forecast_scenarios` - Saved forecast scenarios (per-year or consolidated)
- `forecast_sku_mappings` - KPI to SKU mappings for quote generation
- `timeseries_forecasts` - Forecast containers with config (yearly granularity with JSON config)
- `timeseries_forecast_data` - Per-period data points (SIMs, GB/SIM, calculated KPIs)

## Pricing Algorithm

The pricing engine calculates final prices using multiple factors:

```
Final Price = Base Price × Volume Factor × Term Factor × Env Factor
```

### Key Features:
- **Volume Discounts**: Exponential decay based on quantity doublings
- **Term Interpolation**: Linear interpolation between known term points
- **Time-Phased Aggregation**: Weighted averaging across contract phases

See [Implementation Docs](docs/IMPLEMENTATION.md#6-pricing-engine) for detailed algorithm explanations.

## License

Private - All rights reserved

## Contributing

This is a private project. Please contact the repository owner for contribution guidelines.
