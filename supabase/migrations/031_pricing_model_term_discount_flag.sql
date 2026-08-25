-- ============================================================================
-- PRICING ENGINE - apply_term_discount flag for usage-based pricing models
-- Migration: 031_pricing_model_term_discount_flag.sql
--
-- Mirrors base_charges.apply_term_discount (migration 014) for usage-based
-- SKUs: some usage is inherently on-demand/uncommitted (e.g. support hour
-- overages) and must be priced at the flat configured rate regardless of
-- the package's commitment term, unlike volume-priced CAS usage which
-- legitimately earns a term discount for committing to a longer contract.
-- ============================================================================

ALTER TABLE pricing_models
  ADD COLUMN IF NOT EXISTS apply_term_discount BOOLEAN NOT NULL DEFAULT TRUE;

-- CCS 24/7 overage hours are on-demand by nature — there is no commitment
-- to discount, since the customer cannot know in advance how many overage
-- hours they will need.
UPDATE pricing_models
SET apply_term_discount = FALSE
WHERE sku_id IN (SELECT id FROM skus WHERE code = 'CCS_24_7_Overage');
