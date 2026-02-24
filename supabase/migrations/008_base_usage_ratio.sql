-- Migration 008: Add base/usage ratio knob for CAS pricing
--
-- The ratio shifts weight between fixed base charges and variable usage charges.
-- Default 0.60 matches the current seeded prices (60% base / 40% usage).
-- Range: 0.01 to 0.99

-- Add base/usage ratio to quotes (default 0.60 = current prices)
ALTER TABLE quotes ADD COLUMN base_usage_ratio DECIMAL(4, 3) DEFAULT 0.60;

-- Add ratio factor to quote items for auditability
-- Stores the effective multiplier applied (e.g., 1.33 for base at 80/20)
-- NULL for non-CAS items
ALTER TABLE quote_items ADD COLUMN ratio_factor DECIMAL(8, 4);
