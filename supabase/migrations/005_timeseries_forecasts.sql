-- =============================================
-- Phase 1: Time-Series Forecasts
-- =============================================
-- Support importing Excel-based time-series forecasts with monthly/yearly columns

-- Main forecast container
CREATE TABLE IF NOT EXISTS timeseries_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Time range
    granularity VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly' or 'yearly'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_periods INTEGER NOT NULL,

    -- Config (same as forecast_scenarios)
    take_rate_pcs_udr DECIMAL(5, 4) DEFAULT 0.13,
    take_rate_ccs_udr DECIMAL(5, 4) DEFAULT 0.90,
    take_rate_scs_pcs DECIMAL(5, 4) DEFAULT 1.00,
    peak_average_ratio DECIMAL(5, 2) DEFAULT 3.0,
    busy_hours INTEGER DEFAULT 8,
    days_per_month INTEGER DEFAULT 30,

    -- Import metadata
    original_filename VARCHAR(255),

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-period data points
CREATE TABLE IF NOT EXISTS timeseries_forecast_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES timeseries_forecasts(id) ON DELETE CASCADE,
    period_index INTEGER NOT NULL,  -- 1-based
    period_date DATE NOT NULL,

    -- Inputs
    total_sims INTEGER NOT NULL,
    gb_per_sim DECIMAL(10, 2) NOT NULL,

    -- Calculated outputs
    output_udr INTEGER,
    output_pcs INTEGER,
    output_ccs INTEGER,
    output_scs INTEGER,
    output_cos INTEGER,
    output_peak_throughput DECIMAL(12, 6),
    output_avg_throughput DECIMAL(12, 6),
    output_data_volume_gb DECIMAL(15, 2),

    UNIQUE(forecast_id, period_index)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_timeseries_forecasts_customer ON timeseries_forecasts(customer_id);
CREATE INDEX IF NOT EXISTS idx_timeseries_forecasts_created_by ON timeseries_forecasts(created_by);
CREATE INDEX IF NOT EXISTS idx_timeseries_forecast_data_forecast ON timeseries_forecast_data(forecast_id);

-- Trigger for updated_at on timeseries_forecasts
CREATE OR REPLACE FUNCTION update_timeseries_forecast_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS timeseries_forecasts_updated_at ON timeseries_forecasts;
CREATE TRIGGER timeseries_forecasts_updated_at
    BEFORE UPDATE ON timeseries_forecasts
    FOR EACH ROW
    EXECUTE FUNCTION update_timeseries_forecast_timestamp();

-- RLS policies for timeseries_forecasts
ALTER TABLE timeseries_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY timeseries_forecasts_select ON timeseries_forecasts
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY timeseries_forecasts_insert ON timeseries_forecasts
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY timeseries_forecasts_update ON timeseries_forecasts
    FOR UPDATE TO authenticated
    USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY timeseries_forecasts_delete ON timeseries_forecasts
    FOR DELETE TO authenticated
    USING (auth.uid() = created_by OR created_by IS NULL);

-- RLS policies for timeseries_forecast_data
ALTER TABLE timeseries_forecast_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY timeseries_forecast_data_select ON timeseries_forecast_data
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY timeseries_forecast_data_insert ON timeseries_forecast_data
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY timeseries_forecast_data_update ON timeseries_forecast_data
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY timeseries_forecast_data_delete ON timeseries_forecast_data
    FOR DELETE TO authenticated
    USING (true);

-- =============================================
-- Extend quotes table for time-series support
-- =============================================
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS source_timeseries_id UUID REFERENCES timeseries_forecasts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS timeseries_pricing_mode VARCHAR(20); -- 'pay_per_use' or 'fixed_commitment'

-- Index for timeseries lookups
CREATE INDEX IF NOT EXISTS idx_quotes_source_timeseries ON quotes(source_timeseries_id);

-- =============================================
-- View to get timeseries forecasts with period count
-- =============================================
CREATE OR REPLACE VIEW timeseries_forecast_summary AS
SELECT
    tf.id,
    tf.name,
    tf.description,
    tf.customer_id,
    tf.granularity,
    tf.start_date,
    tf.end_date,
    tf.total_periods,
    tf.original_filename,
    tf.created_at,
    tf.updated_at,
    c.name as customer_name,
    c.company as customer_company,
    COUNT(tfd.id) as data_point_count,
    MIN(tfd.total_sims) as min_sims,
    MAX(tfd.total_sims) as max_sims,
    AVG(tfd.total_sims)::INTEGER as avg_sims
FROM timeseries_forecasts tf
LEFT JOIN customers c ON tf.customer_id = c.id
LEFT JOIN timeseries_forecast_data tfd ON tf.id = tfd.forecast_id
GROUP BY tf.id, c.name, c.company;
