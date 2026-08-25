# SPEC-027: Editable Package Name

**Status:** ready
**Created:** 2026-08-25

## Problem

`quote_packages.package_name` (e.g. "TELNA Full Commitment", the title shown on the PDF rate card per package — `pdf.ts:244`) can only be set once, at creation time (`newPackageName` in the Add Package dialog). There's no way to rename an existing package afterward without a direct DB update.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Add an edit icon next to the package name in `QuoteBuilder.tsx`'s package header (~line 1550), following the same inline-edit pattern as SPEC-024's SKU description: click pencil → `Input` + Save/Cancel, no autosave-on-blur | Confirmed: same UX shape as the recently-added SKU description edit, applied to `package_name` |
| D2 | New `renamePackage` mutation (`supabase.from('quote_packages').update({ package_name }).eq('id', packageId)`), mirroring the existing `deletePackage` mutation's shape in the same file | Consistent with existing mutation conventions in this file |
| D3 | Edit state and click must `e.stopPropagation()` — the package header's outer `<div>` has an `onClick` that toggles expand/collapse; clicking into the rename control must not also collapse/expand the package | The header row is a single clickable surface today; adding a nested interactive control needs to opt out of that behavior |

## Guardrails

- **MUST** stop click propagation on the edit icon, input, and Save/Cancel buttons so the package doesn't expand/collapse while renaming
- **MUST NOT** change `term_months`, `status`, or any other package field — this is name-only, matching the SKU description precedent's narrow scope

## Phases

1. Add `renamePackage` mutation
2. Add inline edit UI (state scoped per-package via a single `editingPackageId`/`draftPackageName` pair, since only one package can be edited at a time) to the package header
3. Verify: typecheck + manual rename in the dev server, confirming it persists and doesn't trigger expand/collapse
