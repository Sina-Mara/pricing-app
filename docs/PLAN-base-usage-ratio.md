# Base/Usage Ratio Knob -- Feature Specification

## Overview

CAS (Connectivity-as-a-Service) prices are composed of two parts: a **base charge** (fixed monthly fee) and a **usage charge** (per-unit consumption fee). The seeded reference prices assume a **60/40 split** (60% base, 40% usage).

The **base/usage ratio knob** lets sales reps adjust this split per quote. Shifting the ratio redistributes revenue between the two charge types without changing the underlying list price. A higher base ratio means more predictable revenue; a higher usage ratio means lower commitment for the customer.

This feature applies **only to CAS-category SKUs**. All other categories ignore the ratio and pass prices through unchanged.

## Math

### Reference Values

| Constant | Value | Meaning |
|---|---|---|
| `CAS_REFERENCE_BASE_RATIO` | 0.60 | Base portion assumed by seeded prices |
| `CAS_REFERENCE_USAGE_RATIO` | 0.40 | Usage portion assumed by seeded prices |

The two constants always sum to 1.0.

### Ratio Factor Formulas

Given a user-selected base ratio `r` (where `0 < r < 1`):

```
baseRatioFactor  = r / CAS_REFERENCE_BASE_RATIO        = r / 0.60
usageRatioFactor = (1 - r) / CAS_REFERENCE_USAGE_RATIO  = (1 - r) / 0.40
```

The factor is a multiplier applied to the corresponding charge type's unit price:

```
adjustedBasePrice  = basePrice  * baseRatioFactor
adjustedUsagePrice = usagePrice * usageRatioFactor
```

All intermediate and final values are rounded to 4 decimal places (`round4`).

### Worked Examples

#### Example 1: Default ratio (r = 0.60)

```
baseRatioFactor  = 0.60 / 0.60 = 1.0000  (no change)
usageRatioFactor = 0.40 / 0.40 = 1.0000  (no change)
```

A $10.00 base charge stays $10.00. A $5.00 usage charge stays $5.00.

#### Example 2: Heavy base (r = 0.80)

```
baseRatioFactor  = 0.80 / 0.60 = 1.3333
usageRatioFactor = 0.20 / 0.40 = 0.5000
```

A $10.00 base charge becomes $13.33. A $5.00 usage charge becomes $2.50.

#### Example 3: Heavy usage (r = 0.10)

```
baseRatioFactor  = 0.10 / 0.60 = 0.1667
usageRatioFactor = 0.90 / 0.40 = 2.2500
```

A $10.00 base charge becomes $1.67. A $5.00 usage charge becomes $11.25.

#### Example 4: Non-CAS SKU (any ratio)

Non-CAS SKUs return `ratioFactor: null` and `adjustedPrice` equals the original price, regardless of the ratio value.

## Database Changes

### `quotes` table

| Column | Type | Default | Nullable | Description |
|---|---|---|---|---|
| `base_usage_ratio` | `numeric(5,4)` | `0.6000` | `NOT NULL` | Selected base/usage ratio for this quote |

- Stored at the **quote level** because all CAS line items in a quote share the same ratio.
- Default `0.6000` means existing quotes require no migration backfill; they produce identical prices.
- Constraint: `CHECK (base_usage_ratio > 0 AND base_usage_ratio < 1)`.

### `quote_items` table

| Column | Type | Default | Nullable | Description |
|---|---|---|---|---|
| `ratio_factor` | `numeric(10,4)` | `NULL` | `YES` | The computed ratio factor applied to this line item |

- `NULL` for non-CAS items (ratio does not apply).
- Stored for audit trail and to reproduce the exact price without re-running the formula.
- Populated by the pricing engine at quote calculation time.

### Migration file

`supabase/migrations/008_base_usage_ratio.sql`

```sql
ALTER TABLE quotes
  ADD COLUMN base_usage_ratio numeric(5,4) NOT NULL DEFAULT 0.6000,
  ADD CONSTRAINT quotes_base_usage_ratio_range
    CHECK (base_usage_ratio > 0 AND base_usage_ratio < 1);

ALTER TABLE quote_items
  ADD COLUMN ratio_factor numeric(10,4);
```

## UI Behavior

### Quote Builder Page

1. **Slider control** labeled "Base / Usage Ratio" displayed in the quote configuration panel.
2. Range: 0.05 to 0.95, step 0.05.
3. Visual display: shows both the base percentage and usage percentage (e.g., "70% Base / 30% Usage").
4. **Preset buttons** for common splits:
   - 60/40 (default)
   - 70/30
   - 80/20
   - 50/50
5. Changing the slider triggers **auto-recalculation** of all CAS line items in the quote.
6. The `ratio_factor` column is shown on CAS line items in the detail view for transparency.

### Visibility Rules

- The ratio control is **only visible** when the quote contains at least one CAS-category SKU.
- Non-CAS line items display no ratio factor column.

### Calculator Page

- When category is set to CAS, an optional ratio input appears.
- The calculated price output shows both the raw price and the ratio-adjusted price.

### Quote Compare Page

- The base/usage ratio is shown as a column in the comparison table when comparing CAS quotes.
- Ratio factor per line item is visible in the detail expansion.

## Scope

- **In scope:** CAS-category SKUs only.
- **Out of scope:** CNO, managed-service, default, and any future non-CAS categories.
- **Reason:** Only CAS pricing is structured as base + usage. Other categories have a single unit price.

## Default Behavior

The default ratio is **0.60** (60% base / 40% usage). This matches the assumption baked into the seeded reference prices in the database. At the default ratio:

- `baseRatioFactor = 1.0` -- no adjustment to base charges.
- `usageRatioFactor = 1.0` -- no adjustment to usage charges.
- All existing quotes and calculations produce identical results to the pre-feature state.
- No data migration is needed; the `DEFAULT 0.6000` on `quotes.base_usage_ratio` covers all existing rows.
