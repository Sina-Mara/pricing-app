-- ============================================================================
-- MVNE PRICING CALCULATOR - SPEC-010
-- Migration: 018_mvne_calculator.sql
--
-- Creates table for persisting MVNE calculator configurations.
-- Stores capacity reference inputs, SKU quantities, and external costs
-- as JSONB for flexibility (component list may evolve).
-- ============================================================================

CREATE TABLE mvne_calculator_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Capacity reference inputs (context only, not used in calculation)
  capacity_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected shape:
  -- {
  --   "num_mvnos": 5,
  --   "subs_per_mvno": 50000,
  --   "parallel_take_rate": 0.5,
  --   "aggregate_throughput_mbps": 5000,
  --   "num_local_breakouts": 20,
  --   "breakout_capacity_mbps": 1000,
  --   "num_grx_sites": 3,
  --   "apns_per_mvno": 1
  -- }

  -- Platform SKU quantities (keyed by SKU code)
  sku_quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected shape:
  -- {
  --   "Cennso_Sites": 5,
  --   "Cennso_vCores": 500,
  --   "Cennso_CoreCluster": 2,
  --   "SMC_sessions": 50000,
  --   "UPG_Bandwidth": 5000,
  --   "TPOSS_UDR": 100000,
  --   "TPOSS_PCS": 50000,
  --   "TPOSS_CCS": 25000
  -- }

  -- External costs (manual $/mo entries)
  external_costs JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected shape:
  -- {
  --   "infrastructure": 0,
  --   "grx": 0,
  --   "esim": 0
  -- }

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated-at trigger
CREATE TRIGGER update_mvne_calculator_configs_updated_at
  BEFORE UPDATE ON mvne_calculator_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE mvne_calculator_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON mvne_calculator_configs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON mvne_calculator_configs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON mvne_calculator_configs
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON mvne_calculator_configs
  FOR DELETE TO authenticated USING (true);
