# SPEC-005: SKU Catalog Dialog with Bulk Add

**Status:** decomposed
**Author:** Claude
**Date:** 2026-02-24

## Problem

The QuoteBuilder uses a basic `Select` dropdown to add SKUs one at a time. With ~30+ SKUs across 4 categories, this is slow and lacks discoverability.

## Solution

Replace the single-select dropdown with a modal catalog dialog that supports:

- **Search** — filter by SKU code or description
- **Category grouping** — collapsible sections for CAS, CNO, CCS, Default with Base Charges / Usage sub-groups
- **Multi-select** — checkbox rows with select all / deselect all
- **Already-added indicator** — disabled rows with "Added" badge for SKUs already in the package
- **Bulk insert** — single `quote_items.insert(rows)` call for all selected SKUs
- **Quote table grouping** — line items in the package table are grouped by category (CAS/CNO/CCS/Default) and sub-grouped by Base Charges / Usage

## Files

| File | Action |
|------|--------|
| `src/components/SkuCatalogDialog.tsx` | New — catalog dialog component |
| `src/pages/QuoteBuilder.tsx` | Modified — replaced Select with dialog trigger + bulk mutation |

## Component API

```typescript
interface SkuCatalogDialogProps {
  isOpen: boolean
  onClose: () => void
  skus: Sku[]
  existingSkuIds: Set<string>
  onAddSkus: (skuIds: string[]) => void
  isAdding?: boolean
}
```

## Data Flow

1. User clicks "Add SKUs..." button on a package
2. `skuCatalogPackageId` state is set → dialog opens
3. User searches, browses categories, selects SKUs via checkboxes
4. User clicks "Add N SKU(s)" → `bulkAddLineItems` mutation fires
5. Mutation inserts rows with `supabase.from('quote_items').insert(rows)`
6. On success: dialog closes, quote refetches, toast shown

## Additional Changes

- **Ratio bug fix:** `calculatePricing` now saves form data (including `base_usage_ratio`) to DB before invoking the edge function, so slider changes take effect
- **Removed ratio column:** The `ratio_factor` column was removed from the quote line items table (uninformative to users)
- **Edge function deployed:** `calculate-pricing` redeployed to include ratio logic

## No New Dependencies

Reuses existing: Dialog, Input, Collapsible, Badge, Button, Separator.
