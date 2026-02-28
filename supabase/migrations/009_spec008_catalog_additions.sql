-- ============================================================================
-- PRICING ENGINE - SPEC-008 CATALOG ADDITIONS
-- Migration: 009_spec008_catalog_additions.sql
--
-- Adds new SKUs and associated pricing/base-charge records for:
--   - LLM usage (Anthropic Claude, OpenAI GPT) — usage-based, category=cas
--   - AI Agent licenses (Anthropic Claude Agent, OpenAI Agent) — base charges, category=cas
--   - HRS resources (Egress Traffic, VM Instance, Public IP, Additional IPs) — category=default
--
-- All pricing values are placeholders (0.00) pending final rate confirmation.
-- Idempotent: uses ON CONFLICT DO NOTHING throughout.
-- ============================================================================

-- ============================================================================
-- SKUs
-- ============================================================================

-- LLM Usage SKUs (usage-based, cas category)
INSERT INTO skus (code, description, unit, category, is_base_charge)
VALUES
    ('Anthropic_Claude_LLM', 'Anthropic Claude LLM Tokens', 'per 1k tokens', 'cas', FALSE),
    ('OpenAI_GPT_LLM',       'OpenAI GPT LLM Tokens',       'per 1k tokens', 'cas', FALSE)
ON CONFLICT (code) DO NOTHING;

-- Agent License SKUs (base charges, cas category)
INSERT INTO skus (code, description, unit, category, is_base_charge)
VALUES
    ('Anthropic_Claude_Agent', 'Anthropic Claude Agent License', 'License', 'cas', TRUE),
    ('OpenAI_Agent',           'OpenAI Agent License',           'License', 'cas', TRUE)
ON CONFLICT (code) DO NOTHING;

-- HRS Resource SKUs (default category)
INSERT INTO skus (code, description, unit, category, is_base_charge)
VALUES
    ('HRS_Egress_Traffic',  'HRS Egress Traffic', 'per GB',    'default', FALSE),
    ('HRS_VM_Instance',     'HRS VM Instance',    'per month', 'default', TRUE),
    ('HRS_PublicIP',        'HRS Public IP',      'per month', 'default', TRUE),
    ('HRS_Additional_IPs',  'HRS Additional IPs', 'per month', 'default', TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- PRICING MODELS (usage-based SKUs only)
-- ============================================================================

-- Anthropic Claude LLM
INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price)
SELECT id, 1, 0.00, 0, 0.00
FROM skus WHERE code = 'Anthropic_Claude_LLM'
ON CONFLICT (sku_id) DO NOTHING;

-- OpenAI GPT LLM
INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price)
SELECT id, 1, 0.00, 0, 0.00
FROM skus WHERE code = 'OpenAI_GPT_LLM'
ON CONFLICT (sku_id) DO NOTHING;

-- HRS Egress Traffic
INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price)
SELECT id, 1, 0.00, 0, 0.00
FROM skus WHERE code = 'HRS_Egress_Traffic'
ON CONFLICT (sku_id) DO NOTHING;

-- ============================================================================
-- BASE CHARGES (fixed-fee SKUs only)
-- ============================================================================

-- Anthropic Claude Agent License
INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 0.00, TRUE
FROM skus WHERE code = 'Anthropic_Claude_Agent'
ON CONFLICT (sku_id) DO NOTHING;

-- OpenAI Agent License
INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 0.00, TRUE
FROM skus WHERE code = 'OpenAI_Agent'
ON CONFLICT (sku_id) DO NOTHING;

-- HRS VM Instance
INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 0.00, TRUE
FROM skus WHERE code = 'HRS_VM_Instance'
ON CONFLICT (sku_id) DO NOTHING;

-- HRS Public IP
INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 0.00, TRUE
FROM skus WHERE code = 'HRS_PublicIP'
ON CONFLICT (sku_id) DO NOTHING;

-- HRS Additional IPs
INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 0.00, TRUE
FROM skus WHERE code = 'HRS_Additional_IPs'
ON CONFLICT (sku_id) DO NOTHING;
