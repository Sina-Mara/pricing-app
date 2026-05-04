-- ============================================================================
-- MANAGED PGW SAAS PRICING CALCULATOR - SPEC-014
-- Migration: 021_managed_pgw_configs.sql
--
-- Stores saved configurations for the Managed PGW SaaS pricing calculator.
-- topology_inputs: deployment sizing (sites, vCores, nodes, Tier 10 SAU cap)
-- external_costs:  fixed monthly infrastructure costs outside SKU catalog
-- ============================================================================

CREATE TABLE managed_pgw_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Deployment topology inputs
  topology_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected shape:
  -- {
  --   "num_local_breakouts": 5,
  --   "num_grx_sites": 2,
  --   "vcores_per_breakout": 16,
  --   "vcores_per_pgw": 32,
  --   "nodes_per_cno_site": 3,
  --   "cno_db_instances": 3,
  --   "tier10_sau_cap": 7500000
  -- }

  -- External infra costs (fixed monthly, not in SKU catalog)
  external_costs JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Expected shape:
  -- [{ "id": "ext_1", "name": "Infrastructure", "fixed_monthly": 0 }]

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_managed_pgw_configs_updated_at
  BEFORE UPDATE ON managed_pgw_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE managed_pgw_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read"   ON managed_pgw_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON managed_pgw_configs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON managed_pgw_configs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON managed_pgw_configs FOR DELETE TO authenticated USING (true);
