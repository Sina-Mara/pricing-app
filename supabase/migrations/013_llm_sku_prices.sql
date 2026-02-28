-- ============================================================================
-- LLM SKU PRICES - Migration 013
--
-- Sets unit prices for LLM token usage SKUs added in migration 009.
-- Blended rates (3:1 input:output ratio) based on Feb 2026 API pricing:
--   - Anthropic Claude Sonnet 4.5: $0.003 input / $0.015 output → $0.006/1k blended
--   - OpenAI GPT-4.1:              $0.002 input / $0.008 output → $0.0035/1k blended
-- ============================================================================

UPDATE pricing_models
SET base_unit_price = 0.006, floor_unit_price = 0.006
WHERE sku_id = (SELECT id FROM skus WHERE code = 'Anthropic_Claude_LLM');

UPDATE pricing_models
SET base_unit_price = 0.0035, floor_unit_price = 0.0035
WHERE sku_id = (SELECT id FROM skus WHERE code = 'OpenAI_GPT_LLM');
