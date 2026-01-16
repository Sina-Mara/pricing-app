-- ============================================================================
-- PRICING ENGINE - SEED DATA
-- Migration: 002_seed_data.sql
-- 
-- Sample data based on original Google Sheets template
-- ============================================================================

-- ============================================================================
-- SKUs (Product Catalog)
-- ============================================================================

INSERT INTO skus (code, description, unit, category, is_base_charge) VALUES
-- CAS Category - Usage SKUs
('Cennso_Sites', 'Cennso Sites Service', 'Sites', 'cas', FALSE),
('Cennso_vCores', 'Cennso vCores Service', 'vCores', 'cas', FALSE),
('Cennso_CoreCluster', 'Cennso Core Cluster Service', 'Core Cluster', 'cas', FALSE),
('SMC_sessions', 'SMC Sessions Service', 'sessions', 'cas', FALSE),
('UPG_Bandwidth', 'UPG Bandwidth Service', 'Mbit/s', 'cas', FALSE),
('TPOSS_UDR', 'TPOSS UDR Service', 'UDR', 'cas', FALSE),
('TPOSS_PCS', 'TPOSS PCS Service', 'PCS', 'cas', FALSE),
('TPOSS_CCS', 'TPOSS CCS Service', 'CCS', 'cas', FALSE),

-- CNO Category - Usage SKUs
('CNO_Sites', 'CNO Sites Service', 'Sites', 'cno', FALSE),
('CNO_Nodes', 'CNO Worker Nodes Service', 'Worker Nodes', 'cno', FALSE),
('CNO_DB', 'CNO Database Instances Service', 'Database Instances', 'cno', FALSE),
('CNO_LACS_Portal', 'CNO LACS-Portal Instances Service', 'LACS-Portal Instances', 'cno', FALSE),
('CNO_LACS_AAA', 'CNO LACS-AAA Instances Service', 'LACS-AAA Instances', 'cno', FALSE),
('CNO_LACS_Gateway', 'CNO LACS-Gateway Instances Service', 'LACS-Gateway Instances', 'cno', FALSE),

-- Base Charge SKUs
('Cennso_base', 'Cennso Solution Base', 'License', 'cas', TRUE),
('SMC_base', 'SMC Solution Base', 'License', 'cas', TRUE),
('UPG_base', 'UPG Solution Base', 'License', 'cas', TRUE),
('TPOSS_base', 'TPOSS Solution Base', 'License', 'cas', TRUE),
('CNO_base', 'CNO Management Base', 'License', 'cno', TRUE),
('CNO_24_7', 'CNO 24/7 Support Base', 'License', 'cno', TRUE),
('CNO_central', 'CNO Central Services Base', 'License', 'cno', TRUE),
('CCS_base', 'CCS Solution Base', 'License', 'ccs', TRUE);

-- ============================================================================
-- PRICING MODELS (Algorithmic Pricing)
-- ============================================================================

-- Get SKU IDs and insert pricing models
INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 17.80, 0.35, 44.72, 13, 'stepped', 10000000, ARRAY[1,5,10,25,50,100]
FROM skus WHERE code = 'Cennso_Sites';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 100, 8.96, 0.15, 1.04, 13, 'stepped', 10000000, ARRAY[1,100,250,500,1000,2500,5000,10000,25000,50000]
FROM skus WHERE code = 'Cennso_vCores';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 5517.30, 0.35, 12.16, 13, 'stepped', 10000000, ARRAY[1,5,10,25,50,100,250,500,1000,2500]
FROM skus WHERE code = 'Cennso_CoreCluster';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1000, 0.2156, 0.25, 0.0016, 13, 'stepped', 100000001, ARRAY[1000,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000]
FROM skus WHERE code = 'SMC_sessions';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1000, 0.7115, 0.25, 0.03, 13, 'stepped', 100000001, ARRAY[1000,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000]
FROM skus WHERE code = 'UPG_Bandwidth';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1000, 0.3802, 0.32, 0.0003, 15, 'stepped', 100000001, ARRAY[1000,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000]
FROM skus WHERE code = 'TPOSS_UDR';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1000, 0.2010, 0.25, 0.0003, 13, 'stepped', 100000001, ARRAY[1000,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000]
FROM skus WHERE code = 'TPOSS_PCS';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1000, 0.2010, 0.25, 0.0003, 13, 'stepped', 100000001, ARRAY[1000,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000]
FROM skus WHERE code = 'TPOSS_CCS';

-- CNO SKUs - mostly smooth/flat pricing
INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 1038.00, 0, 1038.00, 1, 'smooth', 100000001, NULL
FROM skus WHERE code = 'CNO_Sites';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 775.00, 0.2, 43.82, 13, 'stepped', 10001, ARRAY[1,5,10,25,50,100,250,500,1000,2500,5000,10000]
FROM skus WHERE code = 'CNO_Nodes';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 1759.00, 0, 1759.00, 1, 'smooth', 10001, NULL
FROM skus WHERE code = 'CNO_DB';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 2889.00, 0, 2889.00, 1, 'smooth', 10001, NULL
FROM skus WHERE code = 'CNO_LACS_Portal';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 5385.00, 0, 5385.00, 1, 'smooth', 10001, NULL
FROM skus WHERE code = 'CNO_LACS_AAA';

INSERT INTO pricing_models (sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints)
SELECT id, 1, 4975.00, 0, 4975.00, 1, 'smooth', 10001, NULL
FROM skus WHERE code = 'CNO_LACS_Gateway';

-- ============================================================================
-- TERM FACTORS (Commitment Discounts)
-- ============================================================================

-- Default terms
INSERT INTO term_factors (category, term_months, factor) VALUES
('default', 1, 1.20),
('default', 12, 1.00),
('default', 24, 0.90),
('default', 36, 0.80);

-- CAS-specific terms (more aggressive discounts for longer terms)
INSERT INTO term_factors (category, term_months, factor) VALUES
('cas', 1, 1.25),
('cas', 12, 1.00),
('cas', 24, 0.85),
('cas', 36, 0.72),
('cas', 48, 0.65),
('cas', 60, 0.52);

-- CNO-specific terms
INSERT INTO term_factors (category, term_months, factor) VALUES
('cno', 1, 1.15),
('cno', 12, 1.00),
('cno', 24, 0.92),
('cno', 36, 0.85);

-- CCS-specific terms
INSERT INTO term_factors (category, term_months, factor) VALUES
('ccs', 1, 1.20),
('ccs', 12, 1.00),
('ccs', 24, 0.88),
('ccs', 36, 0.78);

-- ============================================================================
-- BASE CHARGES (Fixed Monthly Fees)
-- ============================================================================

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 5625.00, TRUE FROM skus WHERE code = 'Cennso_base';

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 16159.50, TRUE FROM skus WHERE code = 'SMC_base';

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 9310.95, TRUE FROM skus WHERE code = 'UPG_base';

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 10848.60, TRUE FROM skus WHERE code = 'TPOSS_base';

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 8960.00, TRUE FROM skus WHERE code = 'CNO_base';

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 4900.00, TRUE FROM skus WHERE code = 'CNO_24_7';

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 7388.00, TRUE FROM skus WHERE code = 'CNO_central';

INSERT INTO base_charges (sku_id, base_mrc, apply_term_discount)
SELECT id, 98563.00, TRUE FROM skus WHERE code = 'CCS_base';

-- ============================================================================
-- ENVIRONMENT FACTORS
-- ============================================================================

-- Default environment factors (apply to all SKUs unless overridden)
INSERT INTO default_env_factors (environment, factor) VALUES
('production', 1.0),
('reference', 1.2);

-- ============================================================================
-- PERPETUAL CONFIG
-- ============================================================================

INSERT INTO perpetual_config (parameter, value, description) VALUES
('compensation_term_months', 48, 'Number of months of subscription pricing to calculate perpetual license'),
('maintenance_reduction_factor', 0.7, 'Factor to extract license-only price from subscription (0.7 = 70% license, 30% maintenance/support)'),
('maintenance_term_years', 3, 'Number of years of maintenance included with perpetual license'),
('upgrade_protection_percent', 15, 'Upgrade protection fee as percentage of perpetual license'),
('maintenance_percent_cas', 27, 'Annual maintenance percentage for CAS category SKUs'),
('maintenance_percent_cno', 19, 'Annual maintenance percentage for CNO category SKUs'),
('maintenance_percent_default', 20, 'Default annual maintenance percentage for other SKUs'),
('exclude_cno_from_perpetual', 1, 'Set to 1 to exclude CNO SKUs from perpetual model (subscription only)');

-- ============================================================================
-- SAMPLE CUSTOMER
-- ============================================================================

INSERT INTO customers (name, company, email, notes) VALUES
('John Doe', 'ACME Corporation', 'john.doe@acme.com', 'Key enterprise account');

-- ============================================================================
-- SAMPLE QUOTE (Optional - for testing)
-- ============================================================================

-- Insert sample quote
INSERT INTO quotes (customer_id, title, status, valid_until, use_aggregated_pricing)
SELECT 
    c.id,
    'Enterprise Cloud Services - Q1 2026',
    'draft',
    CURRENT_DATE + INTERVAL '30 days',
    TRUE
FROM customers c WHERE c.company = 'ACME Corporation';

-- Insert sample packages
INSERT INTO quote_packages (quote_id, package_name, term_months, status, include_in_quote, sort_order)
SELECT 
    q.id,
    'Base Infrastructure Package',
    36,
    'new',
    TRUE,
    1
FROM quotes q WHERE q.title = 'Enterprise Cloud Services - Q1 2026';

INSERT INTO quote_packages (quote_id, package_name, term_months, status, include_in_quote, sort_order)
SELECT 
    q.id,
    'Production Workload Package',
    24,
    'new',
    TRUE,
    2
FROM quotes q WHERE q.title = 'Enterprise Cloud Services - Q1 2026';

INSERT INTO quote_packages (quote_id, package_name, term_months, status, include_in_quote, sort_order)
SELECT 
    q.id,
    'Development Environment Package',
    12,
    'new',
    TRUE,
    3
FROM quotes q WHERE q.title = 'Enterprise Cloud Services - Q1 2026';

-- Insert sample quote items (Base Infrastructure)
INSERT INTO quote_items (package_id, sku_id, quantity, environment, notes, sort_order)
SELECT 
    qp.id,
    s.id,
    1,
    'production',
    'Solution base charge - 36 month commitment',
    1
FROM quote_packages qp
CROSS JOIN skus s
WHERE qp.package_name = 'Base Infrastructure Package' 
AND s.code = 'Cennso_base';

INSERT INTO quote_items (package_id, sku_id, quantity, environment, notes, sort_order)
SELECT 
    qp.id,
    s.id,
    1,
    'production',
    'Solution base charge - 36 month commitment',
    2
FROM quote_packages qp
CROSS JOIN skus s
WHERE qp.package_name = 'Base Infrastructure Package' 
AND s.code = 'SMC_base';

-- Insert sample quote items (Production Workload)
INSERT INTO quote_items (package_id, sku_id, quantity, environment, notes, sort_order)
SELECT 
    qp.id,
    s.id,
    100,
    'production',
    'Production compute - 24 month commitment',
    1
FROM quote_packages qp
CROSS JOIN skus s
WHERE qp.package_name = 'Production Workload Package' 
AND s.code = 'Cennso_vCores';

INSERT INTO quote_items (package_id, sku_id, quantity, environment, notes, sort_order)
SELECT 
    qp.id,
    s.id,
    10000,
    'production',
    'Production sessions - 24 month commitment',
    2
FROM quote_packages qp
CROSS JOIN skus s
WHERE qp.package_name = 'Production Workload Package' 
AND s.code = 'SMC_sessions';

INSERT INTO quote_items (package_id, sku_id, quantity, environment, notes, sort_order)
SELECT 
    qp.id,
    s.id,
    5,
    'production',
    'Production sites - 24 month commitment',
    3
FROM quote_packages qp
CROSS JOIN skus s
WHERE qp.package_name = 'Production Workload Package' 
AND s.code = 'Cennso_Sites';

-- Insert sample quote items (Development Environment)
INSERT INTO quote_items (package_id, sku_id, quantity, environment, notes, sort_order)
SELECT 
    qp.id,
    s.id,
    50,
    'reference',
    'Dev/test compute - 12 month flexibility',
    1
FROM quote_packages qp
CROSS JOIN skus s
WHERE qp.package_name = 'Development Environment Package' 
AND s.code = 'Cennso_vCores';

INSERT INTO quote_items (package_id, sku_id, quantity, environment, notes, sort_order)
SELECT 
    qp.id,
    s.id,
    2000,
    'reference',
    'Dev/test sessions - 12 month flexibility',
    2
FROM quote_packages qp
CROSS JOIN skus s
WHERE qp.package_name = 'Development Environment Package' 
AND s.code = 'SMC_sessions';
