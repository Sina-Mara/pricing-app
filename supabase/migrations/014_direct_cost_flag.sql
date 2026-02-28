-- Migration 014: Add is_direct_cost flag to skus
-- Direct-cost SKUs (LLM tokens, HRS infrastructure) are pass-through external costs.
-- They must be priced exactly at their configured rate with no adjustments:
-- no base/usage ratio, no volume discount, no term discount, no environment factor.

-- Add column
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS is_direct_cost BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark LLM token SKUs as direct costs
UPDATE skus
SET is_direct_cost = TRUE
WHERE code IN (
  'Anthropic_Claude_LLM',
  'OpenAI_GPT_LLM'
);

-- Mark HRS infrastructure SKUs as direct costs
UPDATE skus
SET is_direct_cost = TRUE
WHERE code IN (
  'HRS_Egress_Traffic',
  'HRS_VM_Instance',
  'HRS_PublicIP',
  'HRS_Additional_IPs'
);

-- HRS base charges must not receive term discounts (they are fixed infrastructure MRCs)
UPDATE base_charges
SET apply_term_discount = FALSE
WHERE sku_id IN (
  SELECT id FROM skus
  WHERE code IN ('HRS_VM_Instance', 'HRS_PublicIP', 'HRS_Additional_IPs')
);
