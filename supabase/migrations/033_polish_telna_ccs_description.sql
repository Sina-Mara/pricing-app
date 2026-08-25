-- ============================================================================
-- PRICING ENGINE - Polish ccs-telna-base-m1 Description
-- Migration: 033_polish_telna_ccs_description.sql
--
-- Replaces the placeholder description from migration 032 (deferred per
-- SPEC-023 D3) with real customer-specific wording, now that the SKU code
-- is finalized. Telna's care scope covers project management, regular
-- service review calls, and a dedicated project support manager/contact,
-- for Telna's GTP Hub (incl. Mapping API) and PGW applications.
-- ============================================================================

UPDATE skus SET description = 'Cennso Care Service (CCS) base charge for Telna. Covers lifecycle support — project management, regular service review calls, and a dedicated project support manager and support contact — for Telna''s GTP Hub (incl. Mapping API) and PGW applications.'
WHERE code = 'ccs-telna-base-m1';
