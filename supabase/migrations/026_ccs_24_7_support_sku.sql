-- ============================================================================
-- PRICING ENGINE - CCS 24/7 Support SKU
-- Migration: 026_ccs_24_7_support_sku.sql
--
-- Adds CCS_24_7: fixed monthly base charge, category=ccs, separate from the
-- existing CNO_24_7 support SKU.
-- ============================================================================

INSERT INTO skus (code, description, unit, category, is_base_charge)
VALUES (
    'CCS_24_7',
    '24/7 support for customer''s P1 and P2 incidents. 9/5 support for any other priorities. Includes 16h of Hyper Care Support.',
    'per month',
    'ccs',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 14900.00, TRUE
FROM skus WHERE code = 'CCS_24_7'
ON CONFLICT (sku_id) DO NOTHING;
