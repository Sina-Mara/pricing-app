-- ============================================================================
-- SOLUTION / APPLICATION / COMPONENT HIERARCHY - Migration 016
--
-- Adds three new fields to support the business hierarchy:
--
--   Solution  (one per quote, e.g. "MVNO Builder")        → quotes.solution
--   Application (groups components, no price item)         → skus.application
--   Component   (grouping key within an application)       → skus.component
--
-- Confirmed seed mappings for MVNO Builder:
--   Cennso app      → Cennso_base/Sites/vCores/CoreCluster  (component=Cennso)
--                     Anthropic_Claude_LLM / OpenAI_GPT_LLM (component=LLM)
--   Packet Gateway  → SMC_*  (component=SMC)
--                     UPG_*  (component=UPG)
--                     TPOSS_* (component=TPOSS)
--   Local Breakouts → HRS_*  (component=HRS)
-- ============================================================================

-- Solution name on the quote
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS solution VARCHAR;

-- Application and component grouping on SKUs
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS application VARCHAR,
  ADD COLUMN IF NOT EXISTS component   VARCHAR;

-- ── Cennso application ───────────────────────────────────────────────────────
UPDATE skus
SET application = 'Cennso', component = 'Cennso'
WHERE code IN ('Cennso_base', 'Cennso_Sites', 'Cennso_vCores', 'Cennso_CoreCluster');

UPDATE skus
SET application = 'Cennso', component = 'LLM'
WHERE code IN ('Anthropic_Claude_LLM', 'OpenAI_GPT_LLM');

-- ── Packet Gateway application ───────────────────────────────────────────────
UPDATE skus
SET application = 'Packet Gateway', component = 'SMC'
WHERE code LIKE 'SMC_%';

UPDATE skus
SET application = 'Packet Gateway', component = 'UPG'
WHERE code LIKE 'UPG_%';

UPDATE skus
SET application = 'Packet Gateway', component = 'TPOSS'
WHERE code LIKE 'TPOSS_%';

-- ── Local Breakouts application ──────────────────────────────────────────────
UPDATE skus
SET application = 'Local Breakouts', component = 'HRS'
WHERE code LIKE 'HRS_%';
