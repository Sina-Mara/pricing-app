-- ============================================================================
-- SOLUTION WRAPPER - Migration 010 (SPEC-008)
--
-- Adds solution_wrapper column to quotes table to record which commercial
-- wrapper applies to a quote. This is a label-only field — it drives no
-- pricing calculations and requires no changes to other tables.
--
-- Wrapper options:
-- - standard: Default Evolent wrapper
-- - lacs:     Local Authority Communication Service
-- - tisp:     Telecommunication Infrastructure Service Provider
-- - rpg:      Regional Provider Group
-- - mvno:     Mobile Virtual Network Operator
-- ============================================================================

-- Create solution_wrapper enum type
CREATE TYPE solution_wrapper_type AS ENUM ('standard', 'lacs', 'tisp', 'rpg', 'mvno');

-- Add solution_wrapper column to quotes table
ALTER TABLE quotes ADD COLUMN solution_wrapper solution_wrapper_type NOT NULL DEFAULT 'standard';
