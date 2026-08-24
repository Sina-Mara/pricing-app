-- ============================================================================
-- PRICING ENGINE - CCS 24/7 Overage SKU
-- Migration: 028_ccs_24_7_overage_sku.sql
--
-- Adds CCS_24_7_Overage: usage-based, category=ccs, hourly rate for support
-- hours exceeding the CCS_24_7 allowance. Flat rate (no volume discount) —
-- per_double_discount=0 and floor_unit_price=base_unit_price mean the unit
-- price is constant regardless of quantity.
--
-- Rate is a placeholder (0.00) pending final confirmation, same as other
-- SKUs added ahead of pricing sign-off (see migration 009); configurable
-- afterwards via /admin/pricing-models.
-- ============================================================================

INSERT INTO skus (code, description, unit, category, is_base_charge)
VALUES (
    'CCS_24_7_Overage',
    'Hourly rate for overage hours beyond the included CCS 24/7 support allowance.',
    'per hour',
    'ccs',
    FALSE
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price)
SELECT id, 1, 0.00, 0, 0.00
FROM skus WHERE code = 'CCS_24_7_Overage'
ON CONFLICT (sku_id) DO NOTHING;
