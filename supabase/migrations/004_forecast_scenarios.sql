-- =============================================
-- Phase 1: Forecast Scenarios
-- =============================================
-- Persist forecast scenarios per customer for reuse

-- Forecast scenarios table
CREATE TABLE IF NOT EXISTS forecast_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- Inputs
    total_sims INTEGER NOT NULL DEFAULT 100000,
    gb_per_sim DECIMAL(10, 2) NOT NULL DEFAULT 1.9,
    -- Config
    take_rate_pcs_udr DECIMAL(5, 4) NOT NULL DEFAULT 0.13,
    take_rate_ccs_udr DECIMAL(5, 4) NOT NULL DEFAULT 0.90,
    take_rate_scs_pcs DECIMAL(5, 4) NOT NULL DEFAULT 1.00,
    peak_average_ratio DECIMAL(5, 2) NOT NULL DEFAULT 3.0,
    busy_hours INTEGER NOT NULL DEFAULT 8,
    days_per_month INTEGER NOT NULL DEFAULT 30,
    -- Cached outputs (calculated on save)
    output_udr INTEGER,
    output_pcs INTEGER,
    output_ccs INTEGER,
    output_scs INTEGER,
    output_cos INTEGER,
    output_peak_throughput DECIMAL(12, 6),
    output_avg_throughput DECIMAL(12, 6),
    output_data_volume_gb DECIMAL(15, 2),
    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster customer lookups
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_customer ON forecast_scenarios(customer_id);
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_created_by ON forecast_scenarios(created_by);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_forecast_scenario_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forecast_scenarios_updated_at ON forecast_scenarios;
CREATE TRIGGER forecast_scenarios_updated_at
    BEFORE UPDATE ON forecast_scenarios
    FOR EACH ROW
    EXECUTE FUNCTION update_forecast_scenario_timestamp();

-- RLS policies for forecast_scenarios
ALTER TABLE forecast_scenarios ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all scenarios
CREATE POLICY forecast_scenarios_select ON forecast_scenarios
    FOR SELECT TO authenticated
    USING (true);

-- Allow authenticated users to insert their own scenarios
CREATE POLICY forecast_scenarios_insert ON forecast_scenarios
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Allow users to update their own scenarios
CREATE POLICY forecast_scenarios_update ON forecast_scenarios
    FOR UPDATE TO authenticated
    USING (auth.uid() = created_by OR created_by IS NULL);

-- Allow users to delete their own scenarios
CREATE POLICY forecast_scenarios_delete ON forecast_scenarios
    FOR DELETE TO authenticated
    USING (auth.uid() = created_by OR created_by IS NULL);

-- =============================================
-- Phase 2: Forecast SKU Mapping
-- =============================================
-- Configure how forecast KPIs map to SKUs

CREATE TABLE IF NOT EXISTS forecast_sku_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kpi_type VARCHAR(50) NOT NULL, -- 'udr', 'pcs', 'ccs', 'scs', 'cos', 'peak_throughput'
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    multiplier DECIMAL(10, 4) NOT NULL DEFAULT 1.0, -- Multiply KPI value by this
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(kpi_type, sku_id)
);

-- Valid KPI types
CREATE TYPE forecast_kpi_type AS ENUM (
    'udr', 'pcs', 'ccs', 'scs', 'cos', 'peak_throughput', 'avg_throughput'
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_forecast_sku_mappings_kpi ON forecast_sku_mappings(kpi_type);
CREATE INDEX IF NOT EXISTS idx_forecast_sku_mappings_sku ON forecast_sku_mappings(sku_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS forecast_sku_mappings_updated_at ON forecast_sku_mappings;
CREATE TRIGGER forecast_sku_mappings_updated_at
    BEFORE UPDATE ON forecast_sku_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_forecast_scenario_timestamp();

-- RLS policies for forecast_sku_mappings
ALTER TABLE forecast_sku_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY forecast_sku_mappings_select ON forecast_sku_mappings
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY forecast_sku_mappings_insert ON forecast_sku_mappings
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY forecast_sku_mappings_update ON forecast_sku_mappings
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY forecast_sku_mappings_delete ON forecast_sku_mappings
    FOR DELETE TO authenticated
    USING (true);

-- =============================================
-- Phase 3: Quote Versioning
-- =============================================
-- Add versioning support to quotes

-- Add version columns to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS version_group_id UUID,
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS version_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_scenario_id UUID REFERENCES forecast_scenarios(id) ON DELETE SET NULL;

-- Index for version group lookups
CREATE INDEX IF NOT EXISTS idx_quotes_version_group ON quotes(version_group_id);
CREATE INDEX IF NOT EXISTS idx_quotes_parent ON quotes(parent_quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_source_scenario ON quotes(source_scenario_id);

-- Function to get next version number within a group
CREATE OR REPLACE FUNCTION get_next_quote_version(group_id UUID)
RETURNS INTEGER AS $$
DECLARE
    max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO max_version
    FROM quotes
    WHERE version_group_id = group_id;
    RETURN max_version;
END;
$$ LANGUAGE plpgsql;

-- View to get quote versions grouped
CREATE OR REPLACE VIEW quote_versions AS
SELECT
    q.id,
    q.quote_number,
    q.title,
    q.status,
    q.version_group_id,
    q.version_number,
    q.version_name,
    q.parent_quote_id,
    q.total_monthly,
    q.total_annual,
    q.created_at,
    q.updated_at,
    c.name as customer_name,
    c.company as customer_company,
    COUNT(*) OVER (PARTITION BY q.version_group_id) as version_count
FROM quotes q
LEFT JOIN customers c ON q.customer_id = c.id
WHERE q.version_group_id IS NOT NULL
ORDER BY q.version_group_id, q.version_number;

-- =============================================
-- Quote History Triggers (implement the existing table)
-- =============================================

-- Trigger to track quote changes
CREATE OR REPLACE FUNCTION track_quote_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO quote_history (
            quote_id,
            changed_by,
            change_type,
            old_values,
            new_values
        ) VALUES (
            NEW.id,
            auth.uid(),
            'update',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO quote_history (
            quote_id,
            changed_by,
            change_type,
            old_values,
            new_values
        ) VALUES (
            OLD.id,
            auth.uid(),
            'delete',
            to_jsonb(OLD),
            NULL
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if quote_history table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quote_history') THEN
        DROP TRIGGER IF EXISTS quote_history_trigger ON quotes;
        CREATE TRIGGER quote_history_trigger
            AFTER UPDATE OR DELETE ON quotes
            FOR EACH ROW
            EXECUTE FUNCTION track_quote_changes();
    END IF;
END
$$;
