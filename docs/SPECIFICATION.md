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

