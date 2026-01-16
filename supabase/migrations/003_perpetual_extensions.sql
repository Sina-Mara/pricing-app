-- ============================================================================
-- PERPETUAL LICENSING EXTENSIONS
-- Add support for perpetual license pricing comparison
-- ============================================================================

-- Add perpetual pricing columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS include_perpetual_pricing BOOLEAN DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS perpetual_total DECIMAL(14, 2);

-- Add perpetual pricing columns to quote_items table
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS perpetual_license DECIMAL(14, 2);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS perpetual_maintenance DECIMAL(14, 2);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS perpetual_total DECIMAL(14, 2);

-- Create perpetual_config table for configuration parameters
CREATE TABLE IF NOT EXISTS perpetual_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter VARCHAR(100) UNIQUE NOT NULL,
  value DECIMAL(14, 4) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default perpetual configuration values
INSERT INTO perpetual_config (parameter, value, description) VALUES
  ('compensation_term_months', 48, 'Number of months of subscription pricing to calculate perpetual license'),
  ('maintenance_reduction_factor', 0.7, 'Factor to extract license-only price from subscription (0.7 = 70% license, 30% maintenance/support)'),
  ('maintenance_term_years', 3, 'Number of years of maintenance included with perpetual license'),
  ('upgrade_protection_percent', 15, 'Upgrade protection fee as percentage of perpetual license'),
  ('maintenance_percent_cas', 27, 'Annual maintenance percentage for CAS category SKUs'),
  ('maintenance_percent_cno', 19, 'Annual maintenance percentage for CNO category SKUs'),
  ('maintenance_percent_default', 20, 'Default annual maintenance percentage for other SKUs'),
  ('exclude_cno_from_perpetual', 1, 'Set to 1 to exclude CNO SKUs from perpetual model (subscription only)')
ON CONFLICT (parameter) DO NOTHING;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_perpetual_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS perpetual_config_updated_at ON perpetual_config;
CREATE TRIGGER perpetual_config_updated_at
  BEFORE UPDATE ON perpetual_config
  FOR EACH ROW
  EXECUTE FUNCTION update_perpetual_config_updated_at();

-- Add RLS policies for perpetual_config
ALTER TABLE perpetual_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON perpetual_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow full access to authenticated users" ON perpetual_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
