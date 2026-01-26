# Pricing App - Complete Specification

## Executive Summary

The Pricing App is an enterprise-grade pricing engine and quote management system for B2B SaaS licensing. It supports multi-factor pricing (volume, term, environment), time-phased contract aggregation, perpetual licensing alternatives, and comprehensive admin configuration.

---

## 1. Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| Dashboard | Metrics overview, recent quotes | Complete |
| Quote Management | List, search, filter quotes | Complete |
| Quote Builder | Create/edit quotes with packages & items | Complete |
| Price Calculator | Single-item pricing preview | Complete |
| Customer Management | Customer directory CRUD | Complete |
| SKU Catalog | Product catalog with pricing info | Complete |
| Timeline Visualization | Contract lifecycle Gantt view | Complete |
| Forecast Evaluator | License requirement calculator | Complete |
| Time-Series Forecast | Excel import with pay-per-use & fixed commitment pricing | Complete |
| Yearly Forecast Input | Direct input of yearly SIMs & data usage with interpolation | Complete |
| Scenario Generation | Create per-year or consolidated scenarios from forecasts | Complete |
| Quote Type Selection | Pay-per-Use vs Commitment quote types with strategy picker | Complete |

## 2. Admin Features

| Feature | Description | Status |
|---------|-------------|--------|
| Pricing Models | Algorithmic pricing configuration | Complete |
| Term Factors | Commitment discount curves by category | Complete |
| Base Charges | Fixed monthly recurring fees | Complete |
| Environment Factors | Production vs Reference pricing | Complete |
| Perpetual Config | Perpetual licensing parameters | Complete |
| Forecast Mapping | KPI to SKU mapping for forecast-to-quote | Complete |

## 3. Pricing Engine Capabilities

| Capability | Description |
|------------|-------------|
| Volume Pricing | Stepped and smooth discount modes |
| Term Discounts | Interpolated/extrapolated by commitment length |
| Environment Factors | Production vs development multipliers |
| Base Charges | Fixed MRC with optional term discount |
| Aggregated Pricing | Cross-package quantity aggregation |
| Time-Phased Aggregation | Weighted pricing across contract phases |
| Perpetual Alternative | License + maintenance calculation |
| Time-Series Pricing | Pay-per-use (monthly) or fixed commitment (peak/avg/percentile) |
| Yearly Forecast Pricing | Direct yearly input with linear interpolation to monthly |
| Scenario-Based Quoting | Generate quotes from forecast scenarios (per-year or consolidated) |
| Quote Types | Commitment (term discounts) vs Pay-per-Use (1-month, no term discounts) |

## 4. Data Model Summary

### Core Entities
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
- `env_factors` / `default_env_factors` - Environment multipliers
- `perpetual_config` - Perpetual licensing parameters
- `forecast_sku_mappings` - KPI to SKU mappings for forecasting

### Time-Series Tables
- `timeseries_forecasts` - Forecast containers with config (supports yearly granularity with config JSON)
- `timeseries_forecast_data` - Per-period data points (monthly, interpolated from yearly)

### Forecast & Quote Types
- `forecast_scenarios` - Saved forecast scenarios (per-year or consolidated)
- `quotes.quote_type` - Commitment or Pay-per-Use pricing mode

## 5. Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS + Shadcn UI |
| State | TanStack React Query |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| Auth | Supabase Auth |
| Testing | Vitest (unit), Playwright (E2E) |

---

## 6. Agent Distribution Guidelines

For building and maintaining this application, work can be distributed across specialized agents:

### 6.1 Frontend UI Agent
**Specialization:** React components, pages, styling

**Responsibilities:**
- Build new pages and components
- Implement UI designs with Tailwind/Shadcn
- Handle form validation and user interactions
- Manage component state with React Query

**Example Tasks:**
- "Create the PricingModels admin page"
- "Add a filter dropdown to the Quotes page"
- "Implement the Timeline Gantt chart"

### 6.2 Backend/Database Agent
**Specialization:** Supabase, SQL, Edge Functions

**Responsibilities:**
- Write database migrations
- Create and modify Edge Functions
- Design database schemas
- Implement RLS policies

**Example Tasks:**
- "Add perpetual licensing columns to quotes table"
- "Create the time-phased aggregation algorithm"
- "Set up RLS policies for quote_items"

### 6.3 Algorithm/Business Logic Agent
**Specialization:** Pricing calculations, business rules

**Responsibilities:**
- Implement pricing formulas
- Port algorithms from Apps Script
- Handle edge cases in calculations
- Optimize calculation performance

**Example Tasks:**
- "Implement volume pricing with smooth mode"
- "Calculate term factor interpolation with caps"
- "Port time-phased aggregation from PackageQuotes.js"

### 6.4 Testing Agent
**Specialization:** Unit tests, E2E tests, test infrastructure

**Responsibilities:**
- Write Vitest unit tests
- Create Playwright E2E tests
- Set up test fixtures and mocks
- Maintain test coverage

**Example Tasks:**
- "Write unit tests for volume pricing"
- "Create E2E test for quote creation flow"
- "Add test coverage for term factor extrapolation"

### 6.5 DevOps/Infrastructure Agent
**Specialization:** Build, CI/CD, deployment

**Responsibilities:**
- Configure build tools (Vite)
- Set up CI/CD pipelines
- Manage environment variables
- Handle deployment configuration

**Example Tasks:**
- "Set up Playwright in CI"
- "Configure Supabase project settings"
- "Add build optimization for production"

## 7. Sub-Agent Decomposition

For complex tasks, main agents can spawn sub-agents:

```
Frontend UI Agent
├── Component Sub-Agent (reusable UI components)
├── Page Sub-Agent (full page implementations)
├── Form Sub-Agent (form handling and validation)
└── Style Sub-Agent (Tailwind customization)

Backend Agent
├── Migration Sub-Agent (schema changes)
├── Function Sub-Agent (Edge Functions)
├── Query Sub-Agent (complex SQL queries)
└── Security Sub-Agent (RLS policies)

Testing Agent
├── Unit Test Sub-Agent (Vitest tests)
├── E2E Test Sub-Agent (Playwright tests)
├── Fixture Sub-Agent (test data setup)
└── Coverage Sub-Agent (coverage analysis)
```

## 8. Task Distribution Matrix

| Task Type | Primary Agent | Sub-Agents | Collaboration |
|-----------|---------------|------------|---------------|
| New Admin Page | Frontend UI | Page, Form | Backend (API) |
| Pricing Algorithm | Algorithm | - | Testing (validation) |
| Database Migration | Backend | Migration | Frontend (types) |
| E2E Test Suite | Testing | E2E, Fixture | Frontend (selectors) |
| Bug Fix (UI) | Frontend UI | Component | - |
| Bug Fix (Calc) | Algorithm | - | Testing (regression) |
| Performance Opt | DevOps | - | Backend (queries) |

## 9. Parallel Execution Opportunities

These tasks can run in parallel with proper coordination:

**Independent Streams:**
```
Stream 1: Frontend Pages
├── Build EnvironmentFactors page
├── Build BaseCharges page
└── Build PerpetualConfig page

Stream 2: Backend Functions
├── Implement aggregation algorithm
├── Add perpetual calculations
└── Optimize pricing queries

Stream 3: Testing
├── Write pricing unit tests
├── Set up Playwright
└── Create E2E test fixtures
```

**Synchronization Points:**
- After backend API changes → Frontend integration
- After algorithm implementation → Testing validation
- After all features → E2E test suite

## 10. Agent Communication Protocol

### Handoff Format
```markdown
## Task Completion Report
- **Agent:** [Agent Type]
- **Task:** [Description]
- **Files Modified:** [List]
- **API Changes:** [If any]
- **Testing Notes:** [Required tests]
- **Dependencies:** [Other agents affected]
```

### Dependency Declaration
```markdown
## Task Requirements
- **Depends On:** [Previous task/agent output]
- **Blocks:** [Tasks waiting on this]
- **Shared Resources:** [Files/APIs used]
```
