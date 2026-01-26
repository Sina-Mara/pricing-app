# Pricing App - Implementation Documentation

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Component Hierarchy](#3-component-hierarchy)
4. [State Management](#4-state-management)
5. [Database Schema](#5-database-schema)
6. [Pricing Engine](#6-pricing-engine)
7. [API & Edge Functions](#7-api--edge-functions)
8. [Authentication](#8-authentication)
9. [Routing](#9-routing)
10. [Testing](#10-testing)
11. [Build & Development](#11-build--development)

---

## 1. Architecture Overview

The Pricing App is a React-based single-page application (SPA) for enterprise B2B SaaS pricing calculations. It uses a modern JAMstack architecture with Supabase as the backend.

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript |
| Build Tool | Vite 5.4 |
| Styling | Tailwind CSS + Radix UI |
| State Management | TanStack Query (React Query) |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| Authentication | Supabase Auth |
| Testing | Vitest (unit) + Playwright (E2E) |

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      React SPA (Vite)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │ Components  │  │   Contexts/Hooks    │  │
│  │  (12 pages) │  │  (Radix UI) │  │  (Auth, Toast)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                  ┌───────▼───────┐                           │
│                  │ TanStack Query│                           │
│                  │ (Cache/State) │                           │
│                  └───────┬───────┘                           │
└──────────────────────────┼───────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │    Supabase Client      │
              │  (supabase-js SDK)      │
              └────────────┬────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼──────┐    ┌───────▼───────┐   ┌──────▼──────┐
│  PostgreSQL │    │ Edge Functions│   │ Supabase    │
│  Database   │    │ (Deno/TS)     │   │ Auth        │
│  (13 tables)│    │ (Pricing Calc)│   │             │
└─────────────┘    └───────────────┘   └─────────────┘
```

---

## 2. Project Structure

```
pricing-app/
├── src/
│   ├── App.tsx                    # Root component with routing
│   ├── main.tsx                   # Entry point, providers setup
│   ├── index.css                  # Tailwind CSS imports
│   │
│   ├── components/
│   │   ├── ui/                    # Radix UI component wrappers
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ... (14+ components)
│   │   ├── layout/
│   │   │   ├── MainLayout.tsx     # App shell with sidebar
│   │   │   └── Sidebar.tsx        # Navigation sidebar
│   │   ├── YearlyForecastInput.tsx     # Table UI for yearly forecast data
│   │   ├── CreateScenarioModal.tsx     # Per-year vs consolidated scenario choice
│   │   ├── ScenarioSelectionModal.tsx  # Multi-select scenarios for quote creation
│   │   ├── CommitmentStrategyPicker.tsx # Peak/avg/specific year strategy picker
│   │   └── ProtectedRoute.tsx     # Auth guard wrapper
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx        # Authentication state
│   │
│   ├── hooks/
│   │   └── use-toast.ts           # Toast notifications
│   │
│   ├── lib/
│   │   ├── pricing.ts             # Pricing calculation algorithms
│   │   ├── excel-parser.ts        # Excel file parsing for time-series
│   │   ├── timeseries-pricing.ts  # Time-series pricing engine + interpolation
│   │   ├── scenario-generator.ts  # Forecast scenario generation (per-year/consolidated)
│   │   ├── quote-generator.ts     # Quote generation (pay-per-use/commitment)
│   │   ├── supabase.ts            # Supabase client & helpers
│   │   ├── pdf.ts                 # PDF generation (jsPDF)
│   │   └── utils.ts               # Formatting utilities
│   │
│   ├── types/
│   │   └── database.ts            # TypeScript interfaces
│   │
│   └── pages/
│       ├── Dashboard.tsx          # Home page with metrics
│       ├── Quotes.tsx             # Quote list
│       ├── QuoteBuilder.tsx       # Create/edit quotes
│       ├── Calculator.tsx         # Price calculator
│       ├── Customers.tsx          # Customer management
│       ├── SKUs.tsx               # Product catalog
│       ├── ForecastEvaluator.tsx  # License forecasting
│       ├── TimeSeriesForecast.tsx # Time-series import & pricing
│       ├── YearlyForecastPage.tsx # Yearly forecast input & scenario creation
│       ├── QuoteCompare.tsx       # Side-by-side quote comparison
│       ├── Timeline.tsx           # Quote history
│       ├── Settings.tsx           # User settings
│       ├── Login.tsx              # Authentication
│       ├── Signup.tsx             # Registration
│       └── admin/
│           ├── PricingModels.tsx      # Pricing configuration
│           ├── TermFactors.tsx        # Commitment discounts
│           ├── EnvironmentFactors.tsx # Env multipliers
│           ├── BaseCharges.tsx        # Fixed fees
│           ├── PerpetualConfig.tsx    # Perpetual licensing
│           └── ForecastMapping.tsx    # KPI to SKU mappings
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql     # Database schema
│   │   ├── 002_seed_data.sql          # Sample data
│   │   ├── 003_perpetual_extensions.sql
│   │   ├── 004_forecast_scenarios.sql # Forecast & versioning
│   │   ├── 005_timeseries_forecasts.sql # Time-series tables
│   │   ├── 006_yearly_forecast_config.sql # Config column for yearly data
│   │   └── 007_quote_type.sql         # Quote type (commitment/pay-per-use)
│   ├── functions/
│   │   └── calculate-pricing/
│   │       └── index.ts               # Edge function
│   └── config.toml                    # Edge function configuration
│
├── tests/
│   ├── setup.ts                   # Test configuration
│   ├── pricing/                   # Unit tests
│   │   ├── volume-pricing.test.ts
│   │   ├── term-factors.test.ts
│   │   ├── time-phased-aggregation.test.ts
│   │   ├── excel-parser.test.ts       # Excel parsing tests (23)
│   │   └── timeseries-pricing.test.ts # Time-series pricing tests (25)
│   └── e2e/                       # Playwright tests
│       ├── auth.spec.ts
│       ├── quote-creation.spec.ts
│       ├── admin-config.spec.ts
│       └── calculator.spec.ts
│
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── playwright.config.ts
```

---

## 3. Component Hierarchy

### Application Structure

```
<App>
  <AuthProvider>
    <QueryClientProvider>
      <BrowserRouter>
        <Routes>
          ├── /login → <Login />
          ├── /signup → <Signup />
          └── /* → <ProtectedRoute>
                      <MainLayout>
                        <Sidebar />
                        <Outlet> → Page Components
                      </MainLayout>
                    </ProtectedRoute>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  </AuthProvider>
</App>
```

### Key Page Components

| Component | Description | Key Features |
|-----------|-------------|--------------|
| `Dashboard` | Home page | Metrics cards, recent quotes list |
| `QuoteBuilder` | Quote editor | Package management, item CRUD, pricing calculation, PDF export |
| `Calculator` | Price preview | SKU selector, parameter inputs, real-time pricing |
| `PricingModels` | Admin config | Model editing, price curve preview |
| `TermFactors` | Admin config | Factor table with interpolation preview |

### UI Component Library

The `/src/components/ui/` directory contains Radix UI primitives wrapped with Tailwind CSS styling:

- **Layout:** `card`, `separator`, `tabs`
- **Forms:** `input`, `label`, `select`, `switch`
- **Feedback:** `toast`, `toaster`, `badge`
- **Overlay:** `dialog`, `dropdown-menu`
- **Data:** `table`
- **Actions:** `button`

---

## 4. State Management

### TanStack Query (Server State)

All server data is managed through TanStack Query with automatic caching and refetching.

```typescript
// Query client configuration (main.tsx)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes
      retry: 1,
    },
  },
});
```

### Query Keys

| Key Pattern | Usage |
|-------------|-------|
| `['quotes']` | Quote list |
| `['quote', id]` | Single quote with packages/items |
| `['customers']` | Customer dropdown |
| `['skus']` | SKU catalog |
| `['pricing-models']` | Admin pricing models |
| `['term-factors']` | Term factor configuration |
| `['env-factors']` | Environment factors |
| `['base-charges']` | Base charge configuration |
| `['perpetual-config']` | Perpetual licensing config |

### Data Flow Pattern

```
User Action (form input, button click)
         │
         ▼
useState (local component state)
         │
         ▼
useMutation (Supabase insert/update)
         │
         ▼
onSuccess: invalidateQueries(['key'])
         │
         ▼
useQuery automatically refetches
         │
         ▼
UI re-renders with new data
```

### Auth State (React Context)

```typescript
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}
```

---

## 5. Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────────┐       ┌──────────────┐
│  customers  │───────│     quotes      │───────│quote_packages│
└─────────────┘  1:N  └─────────────────┘  1:N  └──────────────┘
                             │                         │
                             │                         │ 1:N
                             │                   ┌─────▼──────┐
                             │                   │ quote_items │
                             │                   └─────┬──────┘
                             │                         │
┌─────────────┐              │                         │ N:1
│    skus     │──────────────┴─────────────────────────┘
└──────┬──────┘
       │
       │ 1:1
       ▼
┌──────────────────┐    ┌─────────────┐    ┌─────────────┐
│  pricing_models  │    │   ladders   │    │ base_charges│
└──────────────────┘    └─────────────┘    └─────────────┘
       │
       │ N:1 (by category)
       ▼
┌──────────────────┐    ┌─────────────────────┐
│   term_factors   │    │ default_env_factors │
└──────────────────┘    └─────────────────────┘
```

### Core Tables

#### `skus` - Product Catalog
```sql
CREATE TABLE skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  unit TEXT DEFAULT 'unit',
  category sku_category DEFAULT 'default',  -- 'default', 'cas', 'cno', 'ccs'
  is_base_charge BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `pricing_models` - Algorithmic Pricing
```sql
CREATE TABLE pricing_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID REFERENCES skus(id),
  base_qty INTEGER DEFAULT 100,
  base_unit_price DECIMAL(10,4) NOT NULL,
  per_double_discount DECIMAL(5,4) DEFAULT 0.15,
  floor_unit_price DECIMAL(10,4),
  steps INTEGER DEFAULT 6,
  mode pricing_mode DEFAULT 'stepped',  -- 'stepped', 'smooth', 'manual'
  max_qty INTEGER DEFAULT 100000,
  breakpoints JSONB,  -- Custom quantity tiers
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(sku_id)
);
```

#### `quotes` - Quote Headers
```sql
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE,  -- Auto-generated: YYYY-NNNNN
  customer_id UUID REFERENCES customers(id),
  status quote_status DEFAULT 'draft',
  title TEXT,
  notes TEXT,
  valid_until DATE,
  use_aggregated_pricing BOOLEAN DEFAULT TRUE,
  total_monthly DECIMAL(12,2) DEFAULT 0,
  total_annual DECIMAL(12,2) DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `quote_packages` - Contract Packages
```sql
CREATE TABLE quote_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  term_months INTEGER DEFAULT 12,
  status package_status DEFAULT 'new',  -- 'new', 'ordered', 'existing', 'cancelled'
  include_in_quote BOOLEAN DEFAULT TRUE,  -- FALSE = aggregation only
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  subtotal_monthly DECIMAL(12,2) DEFAULT 0,
  subtotal_annual DECIMAL(12,2) DEFAULT 0
);
```

#### `quote_items` - Line Items with Pricing
```sql
CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES quote_packages(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id),
  quantity INTEGER NOT NULL,
  term_months INTEGER,
  environment environment_type DEFAULT 'production',
  notes TEXT,
  -- Calculated pricing fields (populated by edge function)
  list_price DECIMAL(10,4),
  volume_discount_pct DECIMAL(5,2),
  term_discount_pct DECIMAL(5,2),
  env_factor DECIMAL(5,4),
  unit_price DECIMAL(10,4),
  total_discount_pct DECIMAL(5,2),
  usage_total DECIMAL(12,2),
  base_charge DECIMAL(12,2),
  monthly_total DECIMAL(12,2),
  annual_total DECIMAL(12,2),
  aggregated_qty INTEGER,
  pricing_phases JSONB,  -- Time-phased breakdown
  sort_order INTEGER DEFAULT 0
);
```

### Configuration Tables

#### `term_factors` - Commitment Discounts
```sql
CREATE TABLE term_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category sku_category NOT NULL,
  term_months INTEGER NOT NULL,
  factor DECIMAL(5,4) NOT NULL,  -- 1.0 = standard, 0.8 = 20% discount
  UNIQUE(category, term_months)
);
```

#### `env_factors` - Environment Multipliers
```sql
CREATE TABLE env_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID REFERENCES skus(id),
  environment environment_type NOT NULL,
  factor DECIMAL(5,4),  -- NULL = use default
  UNIQUE(sku_id, environment)
);
```

#### `base_charges` - Fixed Monthly Fees
```sql
CREATE TABLE base_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID REFERENCES skus(id) UNIQUE,
  base_mrc DECIMAL(10,2) NOT NULL,
  apply_term_discount BOOLEAN DEFAULT FALSE
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_quotes_customer ON quotes(customer_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created ON quotes(created_at DESC);
CREATE INDEX idx_quote_packages_quote ON quote_packages(quote_id);
CREATE INDEX idx_quote_items_package ON quote_items(package_id);
CREATE INDEX idx_quote_items_sku ON quote_items(sku_id);
CREATE INDEX idx_ladders_sku ON ladders(sku_id);
CREATE INDEX idx_ladders_qty_range ON ladders(sku_id, min_qty, max_qty);
```

---

## 6. Pricing Engine

### Overview

The pricing engine implements a multi-factor discount system:

```
Final Price = Base Price × Volume Factor × Term Factor × Environment Factor
```

### Core Algorithms (`src/lib/pricing.ts`)

#### Volume Pricing (Stepped/Smooth)

```typescript
export function priceFromModel(model: PricingModel, qty: number): number {
  const { base_qty, base_unit_price, per_double_discount, floor_unit_price } = model;

  // Calculate how many "doublings" from base quantity
  const doubles = Math.log2(qty / base_qty);

  // Apply exponential decay: price drops by per_double_discount per doubling
  // Formula: price = base × (1 - discount)^doubles
  let price = base_unit_price * Math.pow(1 - per_double_discount, doubles);

  // Enforce floor price
  if (floor_unit_price && price < floor_unit_price) {
    price = floor_unit_price;
  }

  return round4(price);
}
```

#### Geometric Bounds (Price Tiers)

```typescript
export function geometricBounds(baseQty: number, maxQty: number, steps: number): number[] {
  // Generate evenly-spaced logarithmic breakpoints
  // ratio = (maxQty / baseQty)^(1/(steps-1))
  const ratio = Math.pow(maxQty / baseQty, 1 / (steps - 1));
  const bounds: number[] = [];

  for (let i = 0; i < steps; i++) {
    bounds.push(Math.round(baseQty * Math.pow(ratio, i)));
  }

  return bounds;
}
```

#### Term Factor Interpolation

```typescript
export function interpolateTermFactor(
  termFactors: TermFactor[],
  targetTerm: number,
  category: SkuCategory
): number {
  // Filter factors for category
  const factors = termFactors
    .filter(tf => tf.category === category)
    .sort((a, b) => a.term_months - b.term_months);

  // Exact match
  const exact = factors.find(f => f.term_months === targetTerm);
  if (exact) return exact.factor;

  // Find surrounding points for interpolation
  const lower = factors.filter(f => f.term_months < targetTerm).pop();
  const upper = factors.find(f => f.term_months > targetTerm);

  if (lower && upper) {
    // Linear interpolation
    const ratio = (targetTerm - lower.term_months) / (upper.term_months - lower.term_months);
    return round4(lower.factor + ratio * (upper.factor - lower.factor));
  }

  // Extrapolation with category-specific caps
  if (!upper && lower) {
    // Beyond known range - apply diminishing returns
    const lastFactor = lower.factor;
    const minFactor = category === 'cas' ? 0.52 : lastFactor * 0.5;
    // ... extrapolation logic
  }

  return 1.0; // Default: no discount
}
```

#### Time-Phased Aggregation

This algorithm handles quotes with multiple packages having different contract terms:

```typescript
export function calculateTimePhaseQuantities(items: QuoteItem[]): Map<string, PhaseData[]> {
  // 1. Find all unique end dates (term boundaries)
  const endDates = new Set<number>();
  items.forEach(item => endDates.add(item.term_months));

  // 2. Create phases at each boundary
  const phases = Array.from(endDates).sort((a, b) => a - b);

  // 3. For each SKU, calculate quantity per phase
  const result = new Map<string, PhaseData[]>();

  items.forEach(item => {
    const skuPhases = result.get(item.sku_id) || [];

    phases.forEach((endMonth, index) => {
      const startMonth = index === 0 ? 1 : phases[index - 1] + 1;

      // Item is active in this phase if its term extends past startMonth
      if (item.term_months >= startMonth) {
        // Add quantity to this phase's total
        skuPhases.push({
          startMonth,
          endMonth,
          duration: endMonth - startMonth + 1,
          quantity: item.quantity,
          items: [item]
        });
      }
    });

    result.set(item.sku_id, skuPhases);
  });

  return result;
}

export function calculateTimeWeightedPrices(
  timePhases: Map<string, PhaseData[]>,
  findUnitPrice: (skuId: string, qty: number) => number
): Map<string, number> {
  const result = new Map<string, number>();

  timePhases.forEach((phases, skuId) => {
    let totalWeightedPrice = 0;
    let totalDuration = 0;

    phases.forEach(phase => {
      // Get aggregated quantity for this phase
      const totalQty = phase.items.reduce((sum, i) => sum + i.quantity, 0);

      // Get unit price at aggregated quantity
      const unitPrice = findUnitPrice(skuId, totalQty);

      // Weight by phase duration
      totalWeightedPrice += unitPrice * phase.duration;
      totalDuration += phase.duration;
    });

    result.set(skuId, totalWeightedPrice / totalDuration);
  });

  return result;
}
```

### Pricing Calculation Flow

```
Input: QuoteItem {sku_id, quantity, term_months, environment}
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 1. List Price = priceFromModel(model, qty=1)          │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 2. Volume Price = priceFromModel(model, actualQty)    │
│    Volume Discount % = (1 - volumePrice/listPrice)    │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 3. Term Factor = interpolateTermFactor(factors, term) │
│    Term Discount % = (1 - termFactor) × 100           │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 4. Env Factor = getEnvFactor(skuId, environment)      │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 5. Unit Price = volumePrice × termFactor × envFactor  │
│    Total Discount % = (1 - unitPrice/listPrice) × 100 │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 6. Usage Total = unitPrice × quantity                 │
│    Base Charge = getBaseCharge(skuId, term)           │
│    Monthly Total = usageTotal + baseCharge            │
│    Annual Total = monthlyTotal × 12                   │
└───────────────────────────────────────────────────────┘
```

---

## 7. API & Edge Functions

### Supabase Client (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Edge function invoker
export async function invokeEdgeFunction<T>(
  functionName: string,
  body: object
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) throw error;
  return data as T;
}
```

### Edge Function: `calculate-pricing`

**Location:** `/supabase/functions/calculate-pricing/index.ts`

**Actions:**

| Action | Input | Output |
|--------|-------|--------|
| `calculate_quote` | `{ quote_id }` | Updates all items, returns totals |
| `calculate_items` | `{ items[] }` | Returns pricing without DB update |
| `get_price_tiers` | `{ sku_id }` | Returns price ladder for visualization |

**Flow for `calculate_quote`:**

```typescript
// 1. Load quote with all packages and items
const quote = await loadQuote(quoteId);

// 2. Load pricing context
const ctx = {
  skus: await loadSkus(),
  pricingModels: await loadPricingModels(),
  ladders: await loadLadders(),
  termFactors: await loadTermFactors(),
  envFactors: await loadEnvFactors(),
  baseCharges: await loadBaseCharges(),
};

// 3. Calculate time phases if aggregation enabled
let weightedPrices = null;
if (quote.use_aggregated_pricing) {
  const phases = calculateTimePhaseQuantities(allItems);
  weightedPrices = calculateTimeWeightedPrices(phases, findUnitPrice);
}

// 4. Calculate each item
const results = items.map(item =>
  calculateItemPricing(ctx, item, packageTerm, weightedPrices)
);

// 5. Update database
await updateQuoteItems(results);
await updatePackageTotals(quote.packages);
await updateQuoteTotals(quote);

// 6. Return response
return { success: true, total_monthly, total_annual, items: results };
```

---

## 8. Authentication

### Auth Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Login     │────▶│  Supabase   │────▶│   Session   │
│   Page      │     │    Auth     │     │   Created   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ AuthContext │
                                        │   Updated   │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ ProtectedRoute
                                        │   Allows    │
                                        └─────────────┘
```

### Protected Route Component

```typescript
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

### Supported Auth Methods

1. **Email/Password** - Traditional signup/signin
2. **Google OAuth** - Social login via Supabase Auth

---

## 9. Routing

### Route Configuration (`App.tsx`)

```typescript
<Routes>
  {/* Public Routes */}
  <Route path="/login" element={<Login />} />
  <Route path="/signup" element={<Signup />} />

  {/* Protected Routes */}
  <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/quotes" element={<Quotes />} />
    <Route path="/quotes/new" element={<QuoteBuilder />} />
    <Route path="/quotes/:id" element={<QuoteBuilder />} />
    <Route path="/quotes/:id/timeline" element={<Timeline />} />
    <Route path="/skus" element={<SKUs />} />
    <Route path="/customers" element={<Customers />} />
    <Route path="/calculator" element={<Calculator />} />
    <Route path="/forecast" element={<ForecastEvaluator />} />
    <Route path="/forecast/timeseries" element={<TimeSeriesForecast />} />
    <Route path="/forecast/yearly" element={<YearlyForecastPage />} />
    <Route path="/settings" element={<Settings />} />

    {/* Admin Routes */}
    <Route path="/admin/pricing-models" element={<PricingModels />} />
    <Route path="/admin/term-factors" element={<TermFactors />} />
    <Route path="/admin/environment-factors" element={<EnvironmentFactors />} />
    <Route path="/admin/base-charges" element={<BaseCharges />} />
    <Route path="/admin/perpetual-config" element={<PerpetualConfig />} />
    <Route path="/admin/forecast-mapping" element={<ForecastMapping />} />
  </Route>
</Routes>
```

### Navigation Structure (Sidebar)

```
Main Navigation
├── Dashboard (/)
├── Quotes (/quotes)
├── SKUs (/skus)
├── Customers (/customers)
├── Calculator (/calculator)
├── Forecast (/forecast)
├── Time-Series (/forecast/timeseries)
└── Yearly Input (/forecast/yearly)

Admin Section (collapsible)
├── Pricing Models (/admin/pricing-models)
├── Term Factors (/admin/term-factors)
├── Environment Factors (/admin/environment-factors)
├── Base Charges (/admin/base-charges)
├── Perpetual Config (/admin/perpetual-config)
└── Forecast Mapping (/admin/forecast-mapping)

Bottom Section
├── Settings (/settings)
└── Sign Out
```

---

## 10. Testing

### Unit Tests (Vitest)

**Location:** `/tests/pricing/`

**Test Files:**

| File | Tests | Coverage |
|------|-------|----------|
| `volume-pricing.test.ts` | 22 | Stepped, smooth, manual modes |
| `term-factors.test.ts` | 15 | Interpolation, extrapolation, caps |
| `time-phased-aggregation.test.ts` | 10 | Phase calculation, weighting |
| `excel-parser.test.ts` | 23 | Date formats, KPI parsing, validation |
| `timeseries-pricing.test.ts` | 25 | Period forecasts, commitment strategies |
| `validation-calculations.test.ts` | 40 | GB/SIM, interpolation, aggregation, pipeline |

**Running Tests:**

```bash
npm run test          # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage report
```

### E2E Tests (Playwright)

**Location:** `/tests/e2e/`

**Test Files:**

| File | Tests | Coverage |
|------|-------|----------|
| `auth.spec.ts` | 8 | Login, signup, validation |
| `quote-creation.spec.ts` | 8 | Quote workflow |
| `admin-config.spec.ts` | 10 | Admin pages |
| `calculator.spec.ts` | 11 | Calculator flow |

**Running E2E Tests:**

```bash
npm run test:e2e      # Headless
npm run test:e2e:ui   # Interactive mode
```

---

## 11. Build & Development

### Development Server

```bash
npm run dev    # Start Vite dev server (hot reload)
```

### Production Build

```bash
npm run build   # TypeScript check + Vite build
npm run preview # Preview production build locally
```

### Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Code Quality

```bash
npm run lint    # ESLint check
```

### Build Output

```
dist/
├── index.html
└── assets/
    ├── index-[hash].css    (~30KB gzipped: ~6KB)
    └── index-[hash].js     (~1MB gzipped: ~310KB)
```

### Dependencies

**Runtime (18):**
- React ecosystem: `react`, `react-dom`, `react-router-dom`
- UI: `@radix-ui/*` (14 packages), `lucide-react`, `tailwind-merge`
- State: `@tanstack/react-query`, `@tanstack/react-table`
- Backend: `@supabase/supabase-js`
- Forms: `react-hook-form`, `zod`
- Utils: `date-fns`, `clsx`, `class-variance-authority`
- Export: `jspdf`, `jspdf-autotable`

**Development (15):**
- Build: `vite`, `@vitejs/plugin-react`, `typescript`
- Styling: `tailwindcss`, `autoprefixer`, `postcss`
- Testing: `vitest`, `@playwright/test`, `@testing-library/*`
- Linting: `eslint`, `typescript-eslint`

---

## Appendix: Type Definitions

### Core Types (`src/types/database.ts`)

```typescript
// Enums
type QuoteStatus = 'draft' | 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'ordered';
type PackageStatus = 'new' | 'ordered' | 'existing' | 'cancelled';
type EnvironmentType = 'production' | 'reference';
type SkuCategory = 'default' | 'cas' | 'cno' | 'ccs';
type PricingMode = 'stepped' | 'smooth' | 'manual';

// Main entities
interface Sku {
  id: string;
  code: string;
  description: string;
  unit: string;
  category: SkuCategory;
  is_base_charge: boolean;
  is_active: boolean;
}

interface PricingModel {
  id: string;
  sku_id: string;
  base_qty: number;
  base_unit_price: number;
  per_double_discount: number;
  floor_unit_price: number;
  steps: number;
  mode: PricingMode;
  max_qty: number;
  breakpoints: number[] | null;
}

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  status: QuoteStatus;
  title: string;
  use_aggregated_pricing: boolean;
  total_monthly: number;
  total_annual: number;
}

interface QuotePackage {
  id: string;
  quote_id: string;
  package_name: string;
  term_months: number;
  status: PackageStatus;
  include_in_quote: boolean;
  subtotal_monthly: number;
  subtotal_annual: number;
}

interface QuoteItem {
  id: string;
  package_id: string;
  sku_id: string;
  quantity: number;
  term_months: number;
  environment: EnvironmentType;
  // Calculated fields
  list_price: number;
  volume_discount_pct: number;
  term_discount_pct: number;
  env_factor: number;
  unit_price: number;
  total_discount_pct: number;
  monthly_total: number;
  annual_total: number;
  pricing_phases: object | null;
}

// API Response
interface CalculatePricingResponse {
  success: boolean;
  total_monthly?: number;
  total_annual?: number;
  items?: PricingResult[];
  error?: string;
}
```
