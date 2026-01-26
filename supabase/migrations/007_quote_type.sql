-- ============================================================================
-- QUOTE TYPE - Migration 007
--
-- Adds quote_type column to quotes table to distinguish between:
-- - commitment: Fixed monthly pricing with volume/term discounts
-- - pay_per_use: Variable pricing based on actual usage each month
-- ============================================================================

-- Create enum for quote type
CREATE TYPE quote_type AS ENUM ('commitment', 'pay_per_use');

-- Add quote_type column to quotes table
ALTER TABLE quotes
ADD COLUMN quote_type quote_type DEFAULT 'commitment';

-- Update any existing quotes to default type
UPDATE quotes SET quote_type = 'commitment' WHERE quote_type IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN quotes.quote_type IS 'Quote pricing mode: commitment (fixed with discounts) or pay_per_use (variable monthly)';

-- Update quote_summary view to include quote_type
DROP VIEW IF EXISTS quote_summary;
CREATE VIEW quote_summary AS
SELECT
    q.id,
    q.quote_number,
    q.title,
    q.status,
    q.quote_type,
    c.name AS customer_name,
    c.company AS customer_company,
    q.total_monthly,
    q.total_annual,
    q.valid_until,
    q.created_at,
    COUNT(DISTINCT qp.id) AS package_count,
    COUNT(qi.id) AS item_count
FROM quotes q
LEFT JOIN customers c ON q.customer_id = c.id
LEFT JOIN quote_packages qp ON q.id = qp.quote_id
LEFT JOIN quote_items qi ON qp.id = qi.package_id
GROUP BY q.id, c.name, c.company;
