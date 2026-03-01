# MVNE Calculator — Overview

## What It Does

The MVNE Calculator models shared infrastructure costs for hosting multiple Quick MVNOs on the Cennso platform. It answers the core sales question:

> **"If we host N Quick MVNOs on our shared infrastructure, what does each MVNO pay per month?"**

The output is a two-part pricing structure:
1. **Base MRC** — fixed monthly charge per MVNO (shared costs / N)
2. **Blended Per-GB Rate** — variable charge per GB of data consumed

Plus a headline metric for slides:
- **Cost per Produced GB** — all-in cost (base + usage) divided by estimated GB

---

## How the Cost Split Works

Costs fall into three buckets, each handled differently:

| Bucket | What's In It | How It's Split |
|--------|-------------|----------------|
| **Shared fixed** | Platform base charges + shared infrastructure (Cennso sites, clusters, CNO) + external fixed costs | Divided equally across N MVNOs |
| **Per-MVNO usage** | Subscriber-driven costs (SMC sessions, UPG bandwidth, TPOSS records) | Charged per MVNO, not split |
| **External per-GB** | Transit costs (GRX, eSIM provisioning, etc.) | Passed through at cost per GB |

### The Formulas

```
Base MRC per MVNO  = (base charges + shared usage + external fixed) / N

Blended Per-GB Rate = (per-MVNO usage costs / estimated GB per MVNO) + external per-GB

Cost per Produced GB = (Base MRC + Per-GB Rate × estimated GB) / estimated GB
```

Where **estimated GB per MVNO** = subscribers per MVNO × GB per subscriber per month.

**Key insight:** Adding more MVNOs reduces the Base MRC (shared costs spread thinner) but does **not** change the Per-GB Rate (subscriber-based costs scale per MVNO).

---

## Platform Components (SKU Categories)

### Cennso (CAS Platform) — umbrella for all core network functions

| Component | Type | What It Covers |
|-----------|------|---------------|
| **Cennso** (CAS infra) | Shared | Sites, vCores, core clusters — split across N |
| **SMC** | Per-MVNO | Session management — sized per subscriber |
| **UPG** | Per-MVNO | User plane gateway bandwidth — per MVNO's share |
| **TPOSS** | Per-MVNO | Subscriber records (UDR, PCS, CCS) — per MVNO |

Each has a **base charge** (fixed platform fee) and **usage SKUs** (quantity-driven, with volume discounts).

### CNO (Container Network Operations) — separate platform

| Component | Type | What It Covers |
|-----------|------|---------------|
| **CNO Sites** | Shared | Kubernetes management nodes — split across N |
| **CNO Nodes** | Shared | Worker nodes per site — split across N |
| **CNO DB** | Shared | Database instances (manual entry) |
| **CNO Base/Support/Central** | Shared | Fixed management, 24/7 support, central services |

### External Costs — third-party / pass-through

User-defined list of cost items, each with:
- **Fixed monthly** (e.g. VM hosting, IP addresses) → split across N
- **Per-GB** (e.g. GRX transit, eSIM provisioning) → passed through directly

---

## Input Parameters

### Capacity Assumptions (drive auto-population)

| Input | Purpose | Example |
|-------|---------|---------|
| # Quick MVNOs | How many MVNOs share the platform | 5 |
| Subs per MVNO | Expected subscribers per MVNO | 50,000 |
| GB / Sub / Month | Data consumption per subscriber | 5 GB |
| Parallel Take Rate | Session concurrency ratio (for SMC) | 0.5 |
| Aggregate Throughput | Total platform bandwidth (Mbit/s) | 5,000 |
| # Local Breakouts | Network breakout points | 20 |
| # GRX/PGW Sites | Core gateway sites | 3 |
| Sizing params | vCores, take rates, nodes per site | varies |

These inputs **auto-populate** SKU quantities using predefined formulas (e.g. 50,000 subs × 0.5 take rate = 25,000 SMC sessions). Users can override any auto-derived value.

### Per-SKU Discounts

Every SKU (usage and base) supports a custom discount percentage (0–100%). This allows modeling negotiated pricing per component.

---

## Output Panel

### Three Headline Numbers

| Metric | What It Shows | Example |
|--------|--------------|---------|
| **Base MRC per MVNO** | Fixed monthly charge | €44,114 |
| **Blended Per-GB Rate** | Variable charge per GB consumed | €0.0171 |
| **Cost per Produced GB** | All-in cost per GB (for slides) | €0.19 |

### Cost Breakdown

Grouped by platform category:

- **Cennso** — base charges + shared usage (all CNF components combined)
- **CNO** — base charges + shared usage
- **External** — fixed monthly + per-GB pass-through

### Sensitivity Table

Shows how pricing changes with different MVNO counts (3, 5, 7, 10, 15):

| # MVNOs | MRC / MVNO | Per-GB | Cost / GB |
|---------|-----------|--------|-----------|
| 3 | €73,523 | €0.0171 | €0.31 |
| **5** | **€44,114** | **€0.0171** | **€0.19** |
| 7 | €31,510 | €0.0171 | €0.14 |
| 10 | €22,057 | €0.0171 | €0.11 |
| 15 | €14,705 | €0.0171 | €0.08 |

Note: Per-GB rate stays constant — only the base MRC decreases as more MVNOs share fixed costs.

---

## Save / Load Configurations

Configurations are saved to Supabase and include all inputs:
- Capacity assumptions
- SKU quantities (including manual overrides)
- Per-SKU discounts
- External cost items

This enables scenario comparison (e.g. "5 MVNOs with 50K subs" vs "10 MVNOs with 20K subs").

---

## Technical Implementation

| Aspect | Detail |
|--------|--------|
| **Frontend** | React + TypeScript + Tailwind, single page at `/mvne-calculator` |
| **Calculation** | Pure functions in `src/lib/mvne-calculator.ts` — no side effects |
| **Data** | SKU prices from Supabase `skus` + `pricing_models` + `base_charges` tables |
| **Persistence** | `mvne_calculator_configs` table (JSONB columns for flexibility) |
| **Volume pricing** | Applied automatically from SKU pricing models (stepped/smooth tiers) |

---

## Evolution History

| Spec | What Changed |
|------|-------------|
| SPEC-010 | Initial calculator — flat cost pool / N |
| SPEC-011 | External costs split into fixed vs per-GB |
| SPEC-012 | Auto-populate SKU quantities from capacity inputs; shared vs per-MVNO split |
| SPEC-013 | Blended per-GB rate from subscriber-based GB estimate; cost per produced GB |
