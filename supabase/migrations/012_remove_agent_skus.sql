-- ============================================================================
-- REMOVE AGENT SKUs - Migration 012
--
-- Removes Anthropic_Claude_Agent and OpenAI_Agent SKUs added in migration 009.
-- Agent capability is included in Cennso Base — no separate SKU required.
-- Only LLM token usage SKUs are needed for AI cost tracking.
-- ============================================================================

DELETE FROM base_charges
WHERE sku_id IN (
    SELECT id FROM skus WHERE code IN ('Anthropic_Claude_Agent', 'OpenAI_Agent')
);

DELETE FROM skus
WHERE code IN ('Anthropic_Claude_Agent', 'OpenAI_Agent');
