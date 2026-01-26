# Pricing Overview

This document outlines our pricing approach for enterprise connectivity platform services.

---

## Quote Types

### Commitment (Fixed Term)

A fixed monthly price for an agreed quantity over a defined contract period (12, 24, 36, or 60 months). Longer commitments and higher volumes unlock deeper discounts. Best suited for predictable, steady-state workloads.

### Pay-Per-Use (Monthly)

Variable monthly billing based on actual consumption. Each month is priced independently with a 1-month term. No term discounts apply. Best suited for workloads with unpredictable or rapidly changing demand.

---

## How Pricing Is Calculated

Final unit pricing is derived by applying three independent discount layers to the catalogue list price:

```
Unit Price = List Price x Volume Factor x Term Factor x Environment Factor
Monthly Total = (Unit Price x Quantity) + Base Charges
Annual Total = Monthly Total x 12
```

### 1. Volume Discounts

Unit prices decrease as committed quantities increase. Discounts follow an exponential decay curve: each time the quantity doubles, the unit price is reduced by a fixed percentage (the "per-doubling discount"). A floor price ensures unit costs never fall below a defined minimum.

Pricing may be presented in one of two formats:

| Format | Description |
|--------|-------------|
| **Stepped** | Discrete price tiers at geometric quantity intervals (e.g. 100, 178, 316, 562, 1 000 units) |
| **Smooth** | Continuous price curve computed from the doubling-discount formula |

### 2. Term Discounts

Longer contract commitments qualify for additional percentage discounts on unit prices. Discount levels are defined at standard commitment points (e.g. 12, 24, 36, 60 months) and interpolated for intermediate terms.

| Term | Typical Discount |
|------|-----------------|
| 1 month (pay-per-use) | 0% |
| 12 months | ~5% |
| 24 months | ~10% |
| 36 months | ~15% |
| 60+ months | up to 40-50% |

Exact discount levels vary by product category and are confirmed in the formal quote.

### 3. Environment Factors

Each line item is associated with an environment type that adjusts pricing:

| Environment | Typical Factor |
|-------------|---------------|
| **Production** | 1.0x (full price) |
| **Reference** (dev/test/sandbox) | 0.5-0.7x |

---

## Base Charges

Some services include a fixed monthly recurring charge (MRC) independent of quantity — for example, a platform fee or support minimum. Base charges are listed as separate line items and may optionally receive term discounts.

---

## Packages and Aggregation

A single quote can contain multiple **packages**, each with its own term length and line items. When aggregated pricing is enabled, quantities for the same SKU are combined across packages to unlock higher volume discounts.

For multi-package quotes with different term lengths, a **time-phased aggregation** method is used: the system identifies time phases where different packages overlap, calculates volume discounts for each phase's combined quantity, and produces a weighted-average unit price across the full contract.

---

## Forecast-Based Quoting

Quotes can be generated directly from demand forecasts. Two approaches are available:

### Max Commitment

All forecast years are aggregated into a single committed quantity using the peak (or average) value across the forecast horizon. One package is created with the full contract term.

### Yearly Commitment

Each forecast year becomes a separate package with a 12-month term, sized to that year's projected demand. This allows quantities (and costs) to scale with growth over the contract period.

### Monthly Pay-Per-Use

The yearly forecast is interpolated to monthly granularity. Each month becomes a separate package reflecting that month's projected consumption, priced independently at pay-per-use rates.

---

## Pricing Example

| | Value |
|---|---|
| SKU | CAS-100 |
| Quantity | 500 units |
| List Price | $100/unit |
| Volume Discount (500 units) | 10% |
| Term Discount (24 months) | 10% |
| Environment | Production (1.0x) |
| **Unit Price** | **$81.00** |
| **Monthly Total** | **$40,500** |
| **Annual Total** | **$486,000** |

---

## Product Categories

Services are grouped into categories, each with its own discount schedule:

| Category | Description |
|----------|-------------|
| **CAS** | Cellular Access Services |
| **CNO** | Central Network Operations |
| **CCS** | Core Connectivity Services |

Term discount depth and volume discount curves may differ between categories.

---

## Perpetual Licensing Alternative

For eligible products, a perpetual license option is available as an alternative to subscription pricing. The perpetual model includes:

- **License fee** — one-time cost based on the equivalent subscription value over a compensation period
- **Annual maintenance** — ongoing fee (19-27% of license cost, depending on category) covering support and updates
- **Upgrade protection** — optional coverage for major version upgrades

A detailed comparison of subscription vs. perpetual costs can be provided upon request.

---

## Summary

| Aspect | Approach |
|--------|----------|
| Volume pricing | Exponential decay curve with floor price; stepped or smooth presentation |
| Term discounts | Percentage discounts interpolated by commitment length |
| Environments | Production (full price) and Reference (reduced) |
| Quote types | Commitment (fixed term) or Pay-Per-Use (monthly) |
| Aggregation | Combined volume discounts across packages with time-phased weighting |
| Forecasting | Max, yearly, or monthly package generation from demand projections |

All pricing is confirmed in the formal quote document. Figures in this overview are illustrative.
