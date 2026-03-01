-- ============================================================================
-- Add sku_discounts JSONB column to mvne_calculator_configs
-- Stores per-SKU discount percentages (0-100) keyed by SKU code.
-- ============================================================================

ALTER TABLE mvne_calculator_configs
  ADD COLUMN sku_discounts JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Expected shape:
-- {
--   "Cennso_Sites": 10,
--   "CNO_base": 15,
--   ...
-- }
