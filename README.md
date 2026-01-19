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

### Admin Configuration
- **Pricing Models** - Configure algorithmic pricing (stepped, smooth, manual modes)
- **Term Factors** - Set commitment discount curves by category
- **Base Charges** - Manage fixed monthly recurring fees
- **Environment Factors** - Configure production vs reference pricing multipliers
- **Perpetual Config** - Set perpetual licensing parameters

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
│   │   └── layout/      # Layout components
│   ├── contexts/        # React contexts (Auth)
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities & business logic
│   │   ├── pricing.ts   # Pricing algorithms
│   │   ├── supabase.ts  # Supabase client
│   │   └── utils.ts     # Formatting helpers
│   ├── pages/           # Page components
│   │   └── admin/       # Admin pages
│   └── types/           # TypeScript definitions
├── supabase/
│   ├── migrations/      # Database schema
│   └── functions/       # Edge functions
├── tests/
│   ├── pricing/         # Unit tests
│   └── e2e/             # Playwright tests
└── docs/                # Documentation
```

## Documentation

- [Specification](docs/SPECIFICATION.md) - Features, data model, and agent guidelines
- [Implementation](docs/IMPLEMENTATION.md) - Technical architecture, algorithms, and database schema

## Testing

### Unit Tests
The pricing algorithms are thoroughly tested with 47+ test cases:

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
