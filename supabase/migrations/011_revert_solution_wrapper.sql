-- ============================================================================
-- REVERT SOLUTION WRAPPER - Migration 011
--
-- Reverts migration 010. Drops the solution_wrapper column and enum type
-- added in SPEC-008 Phase 2. The feature was determined to be premature —
-- a label with no functional impact until downstream use cases are defined.
-- ============================================================================

ALTER TABLE quotes DROP COLUMN IF EXISTS solution_wrapper;

DROP TYPE IF EXISTS solution_wrapper_type;
