-- =============================================
-- Add config column to timeseries_forecasts
-- =============================================
-- This column stores the original yearly input data for forecasts
-- with granularity='yearly', allowing retrieval of the user's
-- original input for editing.

ALTER TABLE timeseries_forecasts
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT NULL;

-- Add a comment explaining the column's purpose
COMMENT ON COLUMN timeseries_forecasts.config IS 'Stores original input data (e.g., yearly data points) for retrieval when editing forecasts';

-- Update the summary view to include config
DROP VIEW IF EXISTS timeseries_forecast_summary;

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
    tf.config,
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
