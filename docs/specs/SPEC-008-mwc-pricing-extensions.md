# SPEC-008: MWC Pricing Extensions

**Status:** decomposed
**Created:** 2026-02-28

## Problem

The MWC demo revealed two pricing gaps: (1) no LLM token usage SKUs in the catalog for AI cost tracking, and (2) no HRS infrastructure SKUs for direct cost quoting. These gaps prevent accurate quoting for AI-enabled and self-hosted deployments.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | LLM token usage SKUs added per provider (per 1k tokens) under cas category | Provider costs differ; needs individual pricing control |
| D2 | Agent capability included in Cennso Base — no separate Agent SKU | No additional catalog entry or pricing change required |
| D3 | HRS pipeline logic is out of scope — only direct cost SKUs added to catalog | Sizing/estimation logic deferred to a future spec |
| D4 | MVNO out of scope — solution wrapper feature deferred | Label-only with no functional impact until downstream use case is defined |

## Guardrails

- **MUST:** LLM SKUs are internal cost inputs; customer-facing pricing flows through Cennso Base

## Acceptance

- [x] LLM token usage SKUs (per provider, per 1k tokens) exist in catalog and can be added to quotes
- [x] HRS resource SKUs (egress traffic, VM, PublicIP, additional IPs) exist in catalog

## Phases

1. **Catalog additions** — add LLM usage SKUs + agent SKUs per provider; add HRS resource SKUs
