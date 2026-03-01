-- ============================================================================
-- MVNO Builder Base SKU
-- Migration: 017_mvno_builder_base_sku.sql
--
-- Adds a dedicated CCS base charge for the MVNO Builder product.
-- Isolated from CCS_base so prices can be adjusted independently.
-- MRC is set to $0.00 — update via Admin UI > Base Charges.
-- ============================================================================

INSERT INTO skus (code, description, unit, category, is_base_charge) VALUES
('MVNO_Builder_base', 'MVNO Builder Base', 'License', 'ccs', TRUE);

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 0.00, TRUE FROM skus WHERE code = 'MVNO_Builder_base';
