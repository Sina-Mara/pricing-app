-- ============================================================================
-- Add sku_overrides JSONB column to mvne_calculator_configs
-- Tracks which SKU quantities have been manually overridden by the user
-- (i.e. differ from auto-populated values derived from capacity inputs).
-- ============================================================================

ALTER TABLE mvne_calculator_configs
  ADD COLUMN sku_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Expected shape:
-- {
--   "Cennso_vCores": true,
--   "SMC_sessions": true,
--   ...
-- }
