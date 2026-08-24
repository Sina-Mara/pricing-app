-- ============================================================================
-- PRICING ENGINE - Polish Cennso/SMC/UPG SKU Descriptions
-- Migration: 029_polish_cennso_smc_upg_descriptions.sql
--
-- Replaces terse internal shorthand ("Cennso Sites Service", "SMC Sessions
-- Service", etc.) with accurate, customer-facing descriptions, starting with
-- the SKUs on the Telna rate card plus the two other Cennso base-licensing
-- scaling metrics (vCores, Core Cluster).
--
-- Sourced from: Cennso Application Support (CAS) info tab (Session Management
-- Controller and User Plane Gateway "Value CNF" descriptions), reviewed and
-- corrected in conversation — Cennso_base is a required foundation license
-- granting the included Cennso Components entitlement (not a "platform"
-- Cennso itself hosts); Sites/vCores/Core Cluster are the usage metrics that
-- license scales by, not standalone services; SMC is not tied to any one
-- application (Packet Gateway, GTP Proxy, GTP Redirector, etc. are all
-- possible), so its description avoids implying otherwise.
-- ============================================================================

UPDATE skus SET description = 'Cennso base license — entitles use of the full set of Cennso Components (management console, telemetry, logging, tracing, metrics, and more).'
WHERE code = 'Cennso_base';

UPDATE skus SET description = 'Deployment sites — usage metric that Cennso base licensing scales by.'
WHERE code = 'Cennso_Sites';

UPDATE skus SET description = 'Virtual CPU cores — usage metric that Cennso base licensing scales by.'
WHERE code = 'Cennso_vCores';

UPDATE skus SET description = 'Core Clusters — usage metric that Cennso base licensing scales by.'
WHERE code = 'Cennso_CoreCluster';

UPDATE skus SET description = 'Session Management Controller (SMC) — Value CNF license. Manages user sessions; integrates with charging, AAA, and policy functions.'
WHERE code = 'SMC_base';

UPDATE skus SET description = 'Concurrent subscriber sessions managed by SMC.'
WHERE code = 'SMC_sessions';

UPDATE skus SET description = 'User Plane Gateway (UPG) — Value CNF license. Handles user traffic; provides PGW/UPF functions with routing, traffic detection, and CG-NAT.'
WHERE code = 'UPG_base';

UPDATE skus SET description = 'Provisioned user-plane throughput capacity via UPG.'
WHERE code = 'UPG_Bandwidth';
