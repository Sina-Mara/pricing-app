# SPEC-011: MVNE External Cost Refinement

**Status:** draft
**Created:** 2026-03-01

## Problem

The MVNE Calculator's external costs section has 3 hardcoded fields (Infrastructure, GRX, eSIM), each a flat €/mo value. All costs — platform and external — are lumped into one total that feeds both the per-MVNO base MRC and per-GB rate identically. In practice, some external costs are fixed monthly (e.g., VM hosting) while others are usage-based per-GB (e.g., GRX transit, eSIM provisioning). Sales needs the calculator to distinguish these so fixed costs flow into the base MRC (shared across N MVNOs) and per-GB costs flow into a separate usage rate.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Each external cost item has two fields: fixed €/mo and per-GB €/GB | Covers pure fixed, pure usage, and mixed items in one model |
| D2 | Dynamic list — users add/remove external cost line items | Different deals have different external cost structures; hardcoding 3 items is too rigid |
| D3 | Fixed external costs → Base MRC (÷ N MVNOs); per-GB costs → pass-through usage rate (not ÷ N) | Per-GB is a marginal cost per GB regardless of MVNO count; fixed costs are shared infrastructure |
| D4 | Pre-populate with 3 default items (Infrastructure, GRX, eSIM) | Preserves familiarity for existing users; can be removed/renamed |
| D5 | No DB migration — JSONB column accepts new array format; old configs migrated in app code on load | Avoids SQL migration complexity; backward compat handled at read time |

## Guardrails

- **MUST:** Separate fixed and per-GB external costs into distinct output streams (base MRC vs usage rate)
- **MUST:** Load old-format configs (`{infrastructure, grx, esim}`) without errors — migrate to new format on read
- **MUST NOT:** Change platform SKU cost calculations or the quote builder
- **SHOULD:** Default list includes Infrastructure, GRX, eSIM so existing workflows feel familiar

## Acceptance

- [ ] External costs section shows dynamic table with Name, Fixed €/mo, Per-GB €/GB columns (verification: add/remove items, values update totals)
- [ ] Base MRC per MVNO = (platform costs + external fixed) / N (verification: enter only fixed costs, MRC matches manual calc)
- [ ] Per-GB Rate = sum of per-GB external rates (verification: enter per-GB values, rate equals their sum)
- [ ] Old saved configs load correctly with values mapped to fixed_monthly (verification: load pre-existing config, values appear in fixed column)
- [ ] Sensitivity table shows varying MRC and constant per-GB across MVNO counts (verification: inspect table values)
- [ ] Save/load round-trips the new array format (verification: save, reload, load — all values restored)

## Phases

1. **Types + calculation engine** — new `MvneExternalCostItem` type, rewrite `calculateMvnePricing` to split fixed vs per-GB, update `buildSensitivityTable`, add migration function
2. **UI: external costs input** — dynamic table with add/remove rows, name/fixed/per-GB fields, replace old 3-field layout
3. **UI: output display** — update Per-MVNO Pricing card and breakdown to show fixed vs usage split, update sensitivity table labels
4. **Persistence compat** — migrate old configs on load, verify save/load round-trip
