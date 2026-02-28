# SPEC-009: Solution & Component Quote View

**Status:** ready
**Created:** 2026-02-28

## Problem

The quote view organises line items by billing category (CAS / CNO / CCS / Default), which reflects internal accounting but not business reality. A quote is always anchored to a **Solution** (one per customer/quote, e.g. MVNO Builder), priced via a CCS base charge. A solution contains **Applications** — e.g. Cennso (core platform + AI Agent), Packet Gateway, Local Breakouts / mini-HRS — each of which bundles a set of **Components** (CAS or HRS SKUs with their base charges and usage). Applications have no price item of their own; their cost is the sum of their components. The current flat view hides this structure, making it hard for a sales rep to explain the quote or verify completeness.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Add `solution` varchar to `quotes` (not packages) | A customer has exactly one solution per quote; solution is quote-scoped, not package-scoped |
| D2 | Add `component` varchar to `skus` | Clean grouping key for CAS SKUs (Cennso / SMC / UPG / TPOSS); nullable for non-component SKUs |
| D3 | Add `application` varchar to `skus` | Groups components under an application label (e.g. "MVNO Builder"); nullable; display-layer concept only — no price item |
| D4 | CCS base charge stays as a SKU line item, not a separate field | Avoids data duplication; the "anchor" role is visual only |
| D5 | Quote view renders: Solution header (CCS) → Applications → Components (Base + Usage) → Direct Costs | CNO excluded for MVNO Builder scope; Direct Costs section unchanged |
| D6 | `solution` is free-text with suggested values; no `solutions` table yet | Avoids premature normalisation; can be promoted to a lookup later |

## Guardrails

- **MUST:** Existing quotes render correctly before and after the migration (`component/application = null` → ungrouped fallback)
- **MUST NOT:** Change pricing calculations — view change only (except schema additions)
- **MUST:** CCS line item always renders at the top of the package as the Solution anchor row
- **SHOULD:** Solution name editable inline on the quote header

## Acceptance

- [ ] `quotes.solution` field exists and is editable in the quote builder header
- [ ] `skus.component` and `skus.application` fields exist; seeded for all CAS SKUs
- [ ] Quote view renders Solution header row (CCS base charge + solution name) at top of package
- [ ] CAS items group: Application → Component → Base Charges + Usage sub-rows
- [ ] Direct Costs section (amber) renders below, unchanged
- [ ] SKUs with `component = null` fall back to current category grouping (no regression for CNO/Default)
- [ ] Pricing totals are identical before and after the view change

## Phases

1. **Schema** — migration: add `component` + `application` to `skus`, add `solution` to `quotes`; seed with confirmed mappings:
   - Cennso app: `Cennso_base/Sites/vCores/CoreCluster` (component=Cennso) + `Anthropic_Claude_LLM/OpenAI_GPT_LLM` (component=LLM)
   - Packet Gateway app: `SMC_*` (component=SMC), `UPG_*` (component=UPG), `TPOSS_*` (component=TPOSS)
   - Local Breakouts app: `HRS_*` (component=HRS)
2. **Quote view restructure** — render Solution header (CCS + solution name); group items by application → component → Base + Usage
3. **Quote header edit** — inline editable `solution` field on the quote header card
