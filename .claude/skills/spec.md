---
name: spec
description: Thin-spec lifecycle - draft → iterating → ready → decomposed
user-invocable: true
memory: project
allowed-tools: Read, Glob, Write, mcp__features__feature_create_bulk, mcp__features__feature_get_stats
commands:
  - name: draft
    args: "[title]"
    description: Create new SPEC-XXX.md in draft status
  - name: iterate
    args: "SPEC-XXX"
    description: Refine spec across sessions, accumulate decisions
  - name: status
    args: "SPEC-XXX"
    description: Check spec status and progress
  - name: ready
    args: "SPEC-XXX"
    description: Mark spec as ready (all questions resolved)
  - name: decompose
    args: "SPEC-XXX"
    description: Create Autoforge features from spec phases
---

# Spec Workflow (Thin Lifecycle)

Specs progress through 4 phases: **draft → iterating → ready → decomposed**

## Workflow

```
/spec draft "Feature Title"   → Creates SPEC-021.md (draft)
/spec iterate SPEC-021        → Refine across sessions
/spec ready SPEC-021          → Mark ready (questions resolved)
/spec decompose SPEC-021      → Creates features in Autoforge
Autoforge executes
```

## Rules (Keep Specs Lean)

| Rule | Limit | Why |
|------|-------|-----|
| **Problem** | 1-2 paragraphs | WHAT not HOW |
| **Decisions** | 3-6 items | Key design choices only |
| **Guardrails** | 3-5 MUST/MUST_NOT | Critical constraints |
| **Acceptance** | 3-7 criteria | Testable outcomes |
| **Phases** | 3-7 phases | Implementation chunks |
| **Total length** | <100 lines | Readable at a glance |

**DON'T include:**
- File paths or code examples
- Detailed implementation steps
- Component diagrams
- API schemas (those go in code)

**DO include:**
- WHAT problem we're solving
- WHY we chose this approach
- WHAT "done" looks like
- ROUGH implementation order (phases)

## Template

```markdown
# SPEC-XXX: Title

**Status:** draft | iterating | ready | decomposed
**Created:** YYYY-MM-DD

## Problem
1-2 paragraphs describing what we're solving and why it matters.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | What we decided | Why we chose this |
| D2 | Another decision | Tradeoff explained |

## Guardrails

- **MUST:** Critical requirement
- **MUST NOT:** Critical constraint
- **SHOULD:** Strong recommendation

## Acceptance

- [ ] Criterion 1 (verification: how to test)
- [ ] Criterion 2 (verification: how to test)

## Phases

1. **Phase name** - task 1, task 2, task 3
2. **Phase name** - task 4, task 5 (depends on phase 1)
3. **Phase name** - task 6, task 7 (depends on phase 2)
```

## Lifecycle Phases

| Phase | Description | Exit Criteria |
|-------|-------------|---------------|
| **draft** | Initial capture from discussion | Problem statement captured |
| **iterating** | Being refined across sessions | Decisions accumulating, questions being resolved |
| **ready** | All open questions resolved | Thin spec complete (~50 lines) |
| **decomposed** | Features created in Autoforge, or implementation complete | Terminal state |

## Commands

### `/spec draft [title]`

Creates a new spec file in **draft** status from current discussion context.

**Steps:**
1. **Find next spec number:** `ls docs/specs/SPEC-*.md | grep -o 'SPEC-[0-9]*' | sort -V | tail -1 | sed 's/SPEC-//' | awk '{print $1+1}'`
2. **Verify no collision:** Check if `docs/specs/SPEC-XXX*.md` already exists
3. Extract problem/decisions from conversation
4. Write `docs/specs/SPEC-XXX-descriptive-name.md` with template above
5. Set status: **draft**

**Output:** SPEC-023-descriptive-name.md with:
- Problem (from discussion)
- Decisions (if captured)
- Placeholder guardrails/acceptance/phases

**Naming:** Always include descriptive suffix (kebab-case, 2-4 words)

**⚠️ CRITICAL:** Always check existing specs first to avoid duplicate numbers!

### `/spec iterate SPEC-XXX`

Refines a spec across sessions. Use this to accumulate decisions and resolve questions.

**Steps:**
1. Read existing `docs/specs/SPEC-XXX.md`
2. Update with new decisions from conversation
3. Move status: **draft → iterating**
4. Append to Decisions section

### `/spec status SPEC-XXX`

Displays current spec status and progress.

**Output:**
- Current phase (draft/iterating/ready/decomposed)
- Decisions count
- Open questions (if any)
- Phases defined

### `/spec ready SPEC-XXX`

Marks spec as **ready** when all open questions are resolved.

**Steps:**
1. Verify all questions answered
2. Move status: **iterating → ready**
3. Finalize guardrails and acceptance criteria

### `/spec decompose SPEC-XXX`

Reads the ready spec and creates Autoforge features.

**Steps:**
1. Read `docs/specs/SPEC-XXX.md`
2. Verify status is **ready**
3. Parse phases → features
4. Call `feature_create_bulk`
5. Update spec status to **decomposed**

**Phase to Feature mapping:**
- Each phase = one feature
- Phase tasks = verification steps
- Phase dependencies = feature dependencies

## Location

```
docs/specs/SPEC-XXX-descriptive-name.md  ← Created here (always use suffix)
```

## Examples

**Good (lean):**
```markdown
## Problem
Chat works but can't do background tasks. Need CLI agents for long-running work.

## Decisions
- D1: Use CLI subprocess, not Agent SDK - simpler, proven
- D2: NATS KV for coordination - already deployed

## Phases
1. Task infrastructure - schema, repo, API
2. Agent manager - spawn, monitor, cleanup
```

**Bad (bloated):**
```markdown
## Problem
[5 paragraphs of background]

## Architecture
[Detailed component diagram]

## API Design
[Request/response schemas]

## Implementation
[Step-by-step code instructions]
```
