-- ============================================================================
-- LLM SKU: CHANGE UNIT FROM PER-1K TO PER-1M TOKENS - Migration 015
--
-- Industry standard is to quote LLM token prices per million tokens (MTok).
-- Changes:
--   1. Update SKU unit label: 'per 1k tokens' → 'per 1M tokens'
--   2. Multiply unit prices × 1000 to keep the same per-token rate:
--        Anthropic Claude: $0.006/1k → $6.00/1M
--        OpenAI GPT:       $0.0035/1k → $3.50/1M
--   3. Divide existing quote_items quantities by 1000 for these SKUs
--      so that existing quotes retain the same token volumes.
-- ============================================================================

-- 1. Update unit label on SKUs
UPDATE skus
SET unit = 'per 1M tokens'
WHERE code IN ('Anthropic_Claude_LLM', 'OpenAI_GPT_LLM');

-- 2. Update pricing model prices (× 1000)
UPDATE pricing_models
SET base_unit_price  = 6.00,
    floor_unit_price = 6.00
WHERE sku_id = (SELECT id FROM skus WHERE code = 'Anthropic_Claude_LLM');

UPDATE pricing_models
SET base_unit_price  = 3.50,
    floor_unit_price = 3.50
WHERE sku_id = (SELECT id FROM skus WHERE code = 'OpenAI_GPT_LLM');

-- 3. Rescale quantities on existing quote line items (÷ 1000)
--    Rounds to nearest whole number; minimum 1.
UPDATE quote_items
SET quantity = GREATEST(1, ROUND(quantity::numeric / 1000))
WHERE sku_id IN (SELECT id FROM skus WHERE code IN ('Anthropic_Claude_LLM', 'OpenAI_GPT_LLM'));
