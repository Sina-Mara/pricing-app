-- ============================================================================
-- PRICING ENGINE - SPEC-020 Customer-Specific Discount
-- Migration: 027_customer_specific_discount.sql
--
-- Adds a one-off, negotiated discount layer at two levels:
--   - Quote-level:  quotes.customer_discount_*        (Contract Total, additive alongside payment cadence)
--   - Per-item:     quote_items.customer_discount_*   (unit price, multiplicative/subtractive chain)
--
-- Both are nullable and default to no effect. Reset (never copied) on new
-- quote versions — see QuoteBuilder's "Create New Version" mutation.
-- ============================================================================

CREATE TYPE discount_type AS ENUM ('percent', 'fixed');

ALTER TABLE quotes
    ADD COLUMN customer_discount_type discount_type DEFAULT NULL,
    ADD COLUMN customer_discount_value NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN customer_discount_note TEXT DEFAULT NULL,
    ADD COLUMN customer_discount_amount NUMERIC(12, 2) DEFAULT NULL;

ALTER TABLE quote_items
    ADD COLUMN customer_discount_type discount_type DEFAULT NULL,
    ADD COLUMN customer_discount_value NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN customer_discount_note TEXT DEFAULT NULL;

COMMENT ON COLUMN quotes.customer_discount_type IS 'One-off negotiated discount on Contract Total: percent or fixed amount; NULL = none';
COMMENT ON COLUMN quotes.customer_discount_value IS 'Discount value: percentage points (0-100) if type=percent, else a flat EUR amount';
COMMENT ON COLUMN quotes.customer_discount_note IS 'Optional free-text justification (e.g. "Loyalty discount per Jan 2026 agreement")';
COMMENT ON COLUMN quotes.customer_discount_amount IS 'Computed EUR amount subtracted from Contract Total; persisted by calculate-pricing so it can be displayed without recomputing';

COMMENT ON COLUMN quote_items.customer_discount_type IS 'One-off negotiated discount on this line item''s unit price: percent or fixed amount per unit; NULL = none';
COMMENT ON COLUMN quote_items.customer_discount_value IS 'Discount value: percentage points (0-100) if type=percent, else a flat EUR amount per unit';
COMMENT ON COLUMN quote_items.customer_discount_note IS 'Optional free-text justification';
