-- ============================================================================
-- PRICING ENGINE - Telna Review Round 2: New SKU + Code Renames
-- Migration: 032_telna_review_sku_changes.sql
--
-- 1. New ccs-telna-base-m1 SKU: a Telna-specific CCS base charge, analogous
--    to CCS_base (fixed monthly base charge, category=ccs, normal term
--    discount behavior). Base rate is EUR 2,000/month + ~17.35% inflation
--    adjustment (deliberately non-round, per instruction), landing at
--    EUR 2,346.90/month. Description is a placeholder pending real
--    customer-specific wording (GTP Hub, PGW, etc.).
--
-- 2. Renames 10 existing SKU codes to a new <category>-<component>-<metric>-
--    <period> naming scheme. sku_id (the actual foreign key used by
--    quote_items/base_charges/pricing_models) is untouched — only the
--    human-readable `code` column changes, so historical quotes are
--    unaffected. Application code that hardcodes the OLD codes
--    (src/lib/managed-pgw-calculator.ts, src/lib/pdf.ts) is updated in the
--    same change set (see accompanying commit).
-- ============================================================================

-- ── New SKU: ccs-telna-base-m1 ──────────────────────────────────────────────

INSERT INTO skus (code, description, unit, category, is_base_charge)
VALUES (
    'ccs-telna-base-m1',
    'Telna-specific Cennso Care Service base charge (description pending final confirmation).',
    'per month',
    'ccs',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 2346.90, TRUE
FROM skus WHERE code = 'ccs-telna-base-m1'
ON CONFLICT (sku_id) DO NOTHING;

-- ── SKU code renames ─────────────────────────────────────────────────────

UPDATE skus SET code = 'cas-cennso-base-m1' WHERE code = 'Cennso_base';
UPDATE skus SET code = 'cas-cennso-site-m1' WHERE code = 'Cennso_Sites';
UPDATE skus SET code = 'cas-cennso-vcore-m1' WHERE code = 'Cennso_vCores';
UPDATE skus SET code = 'cas-cennso-cc-m1' WHERE code = 'Cennso_CoreCluster';
UPDATE skus SET code = 'cas-smc-base-m1' WHERE code = 'SMC_base';
UPDATE skus SET code = 'cas-smc-cos-m1' WHERE code = 'SMC_sessions';
UPDATE skus SET code = 'cas-upg-base-m1' WHERE code = 'UPG_base';
UPDATE skus SET code = 'cas-upg-atp-m1' WHERE code = 'UPG_Bandwidth';
UPDATE skus SET code = 'ccs-24/7-m1' WHERE code = 'CCS_24_7';
UPDATE skus SET code = 'ccs-24/7-add-h1' WHERE code = 'CCS_24_7_Overage';
