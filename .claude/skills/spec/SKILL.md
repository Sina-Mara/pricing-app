---
name: spec
description: Thin-spec lifecycle - draft → iterating → ready → decomposed
user-invocable: true
allowed-tools: Read, Glob, Write
argument-hint: "[draft|iterate|status|ready|decompose] [SPEC-XXX or title]"
---

# Spec Workflow (Thin Lifecycle)

Parse `$ARGUMENTS` to determine the command. First word is the action, rest is the argument.

- `/spec draft My Feature Title` → Create new spec in draft status
- `/spec iterate SPEC-XXX` → Refine spec across sessions
- `/spec status SPEC-XXX` → Check spec status and progress
- `/spec ready SPEC-XXX` → Mark spec as ready (all questions resolved)
- `/spec decompose SPEC-XXX` → Create tasks/features from spec phases

Specs progress through 4 phases: **draft → iterating → ready → decomposed**

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

## Commands

### `draft [title]`

Creates a new spec file in **draft** status from current discussion context.

**Steps:**
1. **Find next spec number:** Glob `docs/specs/SPEC-*.md`, find highest number, increment
2. **Verify no collision:** Check if `docs/specs/SPEC-XXX*.md` already exists
3. Extract problem/decisions from conversation
4. Write `docs/specs/SPEC-XXX-descriptive-name.md` with template above
5. Set status: **draft**

**Naming:** Always include descriptive suffix (kebab-case, 2-4 words)

### `iterate SPEC-XXX`

Refines a spec across sessions. Use this to accumulate decisions and resolve questions.

**Steps:**
1. Read existing `docs/specs/SPEC-XXX*.md`
2. Update with new decisions from conversation
3. Move status: **draft → iterating**
4. Append to Decisions section

### `status SPEC-XXX`

Displays current spec status and progress.

**Output:**
- Current phase (draft/iterating/ready/decomposed)
- Decisions count
- Open questions (if any)
- Phases defined

### `ready SPEC-XXX`

Marks spec as **ready** when all open questions are resolved.

**Steps:**
1. Verify all questions answered
2. Move status: **iterating → ready**
3. Finalize guardrails and acceptance criteria

### `decompose SPEC-XXX`

Reads the ready spec and creates implementation tasks.

**Steps:**
1. Read `docs/specs/SPEC-XXX*.md`
2. Verify status is **ready**
3. Parse phases → tasks
4. Create tasks using TaskCreate
5. Update spec status to **decomposed**

## Location

```
docs/specs/SPEC-XXX-descriptive-name.md
```
