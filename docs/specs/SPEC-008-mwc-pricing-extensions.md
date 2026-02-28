# SPEC-008: MWC Pricing Extensions

**Status:** decomposed
**Created:** 2026-02-28

## Problem

The MWC demo revealed three pricing gaps: (1) no AI/LLM SKUs in the catalog, (2) no HRS infrastructure SKUs for direct cost quoting, and (3) MVNO needs to be representable as a solution type. These gaps prevent accurate quoting for AI-enabled and self-hosted deployments.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | AI/LLM SKUs added to Cennso Base category | Pricing absorbed into base; no separate AI line item for customer |
| D2 | Separate per-provider LLM usage SKUs (per 1k tokens) | Provider costs differ; needs individual pricing control |
| D3 | Agent SKUs are base/fixed, not usage-based | Agent = software extension, not token consumption |
| D4 | MVNO = solution wrapper label only, no quote structure change | Existing quote type handles it |
| D5 | HRS pipeline logic is out of scope — only direct cost SKUs added to catalog | Sizing/estimation logic deferred to a future spec |

## Guardrails

- **MUST NOT:** Create a new quote type for MVNO — use existing solution wrapper mechanism
- **MUST:** LLM SKUs are internal cost inputs; customer-facing pricing flows through Cennso Base

## Acceptance

- [ ] LLM usage SKUs (per provider, per 1k tokens) exist in catalog and can be added to quotes
- [ ] Agent SKUs (per provider) exist as base/fixed SKUs in catalog
- [ ] MVNO appears as a selectable solution wrapper label on quotes
- [ ] HRS resource SKUs (egress traffic, VM, PublicIP, additional IPs) exist in catalog

## Phases

1. **Catalog additions** — add LLM usage SKUs + agent SKUs per provider; add HRS resource SKUs
2. **MVNO wrapper** — add MVNO as selectable solution wrapper option
