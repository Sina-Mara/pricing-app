-- ============================================================================
-- PRICING ENGINE - SUPABASE SCHEMA
-- Migration: 001_initial_schema.sql
-- 
-- This schema supports:
-- - Multi-factor pricing (volume, term, environment)
-- - Category-specific term discounts (CAS, CNO, CCS, default)
-- - Stepped and smooth pricing models
-- - Manual ladder overrides
-- - Base charges (fixed fees) vs usage charges
-- - Package-based quotes with aggregation
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE pricing_mode AS ENUM ('stepped', 'smooth', 'manual');
CREATE TYPE sku_category AS ENUM ('default', 'cas', 'cno', 'ccs');
CREATE TYPE environment_type AS ENUM ('production', 'reference');
CREATE TYPE quote_status AS ENUM ('draft', 'pending', 'sent', 'accepted', 'rejected', 'expired', 'ordered');
CREATE TYPE package_status AS ENUM ('new', 'ordered', 'existing', 'cancelled');

-- ============================================================================
-- CORE PRICING TABLES
-- ============================================================================

-- SKUs (Product Catalog)
CREATE TABLE skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    unit VARCHAR(50) NOT NULL,
    category sku_category DEFAULT 'default',
    is_base_charge BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE skus IS 'Product catalog - all billable SKUs';
COMMENT ON COLUMN skus.code IS 'Unique SKU identifier (e.g., Cennso_vCores)';
COMMENT ON COLUMN skus.category IS 'Determines which term factor table to use';
COMMENT ON COLUMN skus.is_base_charge IS 'TRUE = fixed monthly fee, FALSE = usage-based';

-- Pricing Models (Algorithmic Pricing Rules)
CREATE TABLE pricing_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    base_qty INTEGER NOT NULL DEFAULT 1,
    base_unit_price DECIMAL(12, 6) NOT NULL,
    per_double_discount DECIMAL(5, 4) DEFAULT 0.15,
    floor_unit_price DECIMAL(12, 6) DEFAULT 0,
    steps INTEGER DEFAULT 13,
    mode pricing_mode DEFAULT 'stepped',
    max_qty BIGINT DEFAULT 10000000,
    breakpoints BIGINT[] DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sku_id)
);

COMMENT ON TABLE pricing_models IS 'Algorithmic pricing rules - generates price tiers dynamically';
COMMENT ON COLUMN pricing_models.per_double_discount IS 'Discount per 2x quantity increase (0.15 = 15% cheaper)';
COMMENT ON COLUMN pricing_models.breakpoints IS 'Custom quantity breakpoints (overrides geometric steps)';

-- Ladders (Manual Price Tiers)
CREATE TABLE ladders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    min_qty BIGINT NOT NULL,
    max_qty BIGINT, -- NULL = infinity
    unit_price DECIMAL(12, 6) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ladders IS 'Explicit price tiers - used when mode=manual or no pricing_model exists';
COMMENT ON COLUMN ladders.max_qty IS 'NULL represents infinity (open-ended tier)';

CREATE INDEX idx_ladders_sku ON ladders(sku_id);
CREATE INDEX idx_ladders_qty_range ON ladders(sku_id, min_qty, max_qty);

-- Term Factors (Commitment Discounts)
CREATE TABLE term_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category sku_category NOT NULL,
    term_months INTEGER NOT NULL,
    factor DECIMAL(5, 4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category, term_months)
);

COMMENT ON TABLE term_factors IS 'Term commitment discount factors by category';
COMMENT ON COLUMN term_factors.factor IS '1.0 = standard rate, 0.8 = 20% discount, 1.2 = 20% premium';

-- Base Charges (Fixed Monthly Fees)
CREATE TABLE base_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    base_mrc DECIMAL(12, 2) NOT NULL,
    apply_term_discount BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sku_id)
);

COMMENT ON TABLE base_charges IS 'Fixed monthly recurring charges (platform fees, support, etc.)';
COMMENT ON COLUMN base_charges.apply_term_discount IS 'Whether term factors apply to this base charge';

-- Environment Factors (Production vs Reference Pricing)
CREATE TABLE env_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    environment environment_type NOT NULL,
    factor DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sku_id, environment)
);

COMMENT ON TABLE env_factors IS 'Environment-specific price multipliers';
COMMENT ON COLUMN env_factors.factor IS 'Multiplier for this environment (1.0 = standard, 1.2 = 20% more)';

-- Default Environment Factors (wildcard rules)
CREATE TABLE default_env_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    environment environment_type NOT NULL UNIQUE,
    factor DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE default_env_factors IS 'Default environment factors when no SKU-specific rule exists';

-- ============================================================================
-- BUSINESS TABLES
-- ============================================================================

-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_company ON customers(company);
CREATE INDEX idx_customers_email ON customers(email);

-- Quotes (Header)
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    status quote_status DEFAULT 'draft',
    title VARCHAR(255),
    notes TEXT,
    valid_until DATE,
    use_aggregated_pricing BOOLEAN DEFAULT TRUE,
    
    -- Calculated totals (denormalized for performance)
    total_monthly DECIMAL(14, 2) DEFAULT 0,
    total_annual DECIMAL(14, 2) DEFAULT 0,
    
    created_by UUID, -- Could reference auth.users
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE quotes IS 'Quote header - contains one or more packages';
COMMENT ON COLUMN quotes.use_aggregated_pricing IS 'TRUE = aggregate quantities across packages for volume pricing';

CREATE INDEX idx_quotes_customer ON quotes(customer_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created ON quotes(created_at DESC);

-- Quote Packages
CREATE TABLE quote_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    term_months INTEGER NOT NULL DEFAULT 12,
    status package_status DEFAULT 'new',
    include_in_quote BOOLEAN DEFAULT TRUE,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    
    -- Calculated totals (denormalized)
    subtotal_monthly DECIMAL(14, 2) DEFAULT 0,
    subtotal_annual DECIMAL(14, 2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE quote_packages IS 'Packages within a quote - can have different terms';
COMMENT ON COLUMN quote_packages.include_in_quote IS 'FALSE = used for aggregation only (existing contracts)';

CREATE INDEX idx_quote_packages_quote ON quote_packages(quote_id);

-- Quote Items (Line Items)
CREATE TABLE quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID REFERENCES quote_packages(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE RESTRICT,
    quantity DECIMAL(14, 4) NOT NULL,
    term_months INTEGER, -- Can override package term
    environment environment_type DEFAULT 'production',
    notes TEXT,
    
    -- Pricing breakdown (calculated by Edge Function)
    list_price DECIMAL(12, 6),
    volume_discount_pct DECIMAL(5, 2),
    term_discount_pct DECIMAL(5, 2),
    env_factor DECIMAL(5, 4),
    unit_price DECIMAL(12, 6),
    total_discount_pct DECIMAL(5, 2),
    
    -- Totals
    usage_total DECIMAL(14, 2),
    base_charge DECIMAL(14, 2),
    monthly_total DECIMAL(14, 2),
    annual_total DECIMAL(14, 2),
    
    -- Aggregation info (for display)
    aggregated_qty DECIMAL(14, 4), -- Total qty across all packages
    pricing_phases JSONB, -- Time-phased pricing details
    
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE quote_items IS 'Individual line items within a package';
COMMENT ON COLUMN quote_items.term_months IS 'NULL = use package term_months';
COMMENT ON COLUMN quote_items.pricing_phases IS 'JSON details of time-phased pricing if applicable';

CREATE INDEX idx_quote_items_package ON quote_items(package_id);
CREATE INDEX idx_quote_items_sku ON quote_items(sku_id);

-- ============================================================================
-- PERPETUAL LICENSING CONFIG
-- ============================================================================

CREATE TABLE perpetual_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parameter VARCHAR(100) UNIQUE NOT NULL,
    value DECIMAL(10, 4) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE perpetual_config IS 'Configuration for perpetual license calculations';

-- ============================================================================
-- AUDIT / HISTORY
-- ============================================================================

CREATE TABLE quote_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'status_changed', etc.
    old_values JSONB,
    new_values JSONB,
    changed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quote_history_quote ON quote_history(quote_id);
CREATE INDEX idx_quote_history_created ON quote_history(created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_skus_updated_at BEFORE UPDATE ON skus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_pricing_models_updated_at BEFORE UPDATE ON pricing_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_ladders_updated_at BEFORE UPDATE ON ladders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_term_factors_updated_at BEFORE UPDATE ON term_factors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_base_charges_updated_at BEFORE UPDATE ON base_charges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_env_factors_updated_at BEFORE UPDATE ON env_factors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_quote_packages_updated_at BEFORE UPDATE ON quote_packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_quote_items_updated_at BEFORE UPDATE ON quote_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Generate quote number
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    seq_num INTEGER;
BEGIN
    year_prefix := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(quote_number FROM 6) AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM quotes
    WHERE quote_number LIKE year_prefix || '-%';
    
    NEW.quote_number := year_prefix || '-' || LPAD(seq_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_quote_number_trigger
    BEFORE INSERT ON quotes
    FOR EACH ROW
    WHEN (NEW.quote_number IS NULL)
    EXECUTE FUNCTION generate_quote_number();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladders ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE env_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_env_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE perpetual_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_history ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users (adjust based on your needs)
-- For now, allow all authenticated users to read/write

CREATE POLICY "Allow authenticated read" ON skus
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON skus
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON skus
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON pricing_models
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON pricing_models
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON pricing_models
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON ladders
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON ladders
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON ladders
    FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON ladders
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON term_factors
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON term_factors
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON term_factors
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON base_charges
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON base_charges
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON base_charges
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON env_factors
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON env_factors
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON env_factors
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON default_env_factors
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON default_env_factors
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON default_env_factors
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON customers
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON customers
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON customers
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON quotes
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON quotes
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON quotes
    FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON quotes
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON quote_packages
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON quote_packages
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON quote_packages
    FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON quote_packages
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON quote_items
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON quote_items
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON quote_items
    FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON quote_items
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON perpetual_config
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON perpetual_config
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON perpetual_config
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON quote_history
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON quote_history
    FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- SKU with pricing info
CREATE VIEW sku_pricing_summary AS
SELECT 
    s.id,
    s.code,
    s.description,
    s.unit,
    s.category,
    s.is_base_charge,
    pm.mode AS pricing_mode,
    pm.base_unit_price,
    pm.per_double_discount,
    bc.base_mrc,
    bc.apply_term_discount
FROM skus s
LEFT JOIN pricing_models pm ON s.id = pm.sku_id
LEFT JOIN base_charges bc ON s.id = bc.sku_id
WHERE s.is_active = TRUE;

-- Quote summary
CREATE VIEW quote_summary AS
SELECT 
    q.id,
    q.quote_number,
    q.title,
    q.status,
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
