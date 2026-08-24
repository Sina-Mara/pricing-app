-- ============================================================================
-- PRICING ENGINE - Polish CCS_24_7 Description
-- Migration: 030_polish_ccs_24_7_description.sql
--
-- The prior description mixed in details that don't belong to this SKU:
-- 9/5 support is already included in the standard/base pricing regardless
-- of this SKU, and P1/P2 incident-priority framing is unnecessary — this
-- SKU is simply the 24/7 availability upgrade. "Hyper Care Support" was
-- also internal terminology; replaced with plain "support".
-- ============================================================================

UPDATE skus SET description = 'Extends support availability to 24/7, upgrading from the standard 9/5 hours. Includes 16 hours of support.'
WHERE code = 'CCS_24_7';
