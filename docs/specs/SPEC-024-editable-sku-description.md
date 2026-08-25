# SPEC-024: Editable SKU Description in Admin UI

**Status:** ready
**Created:** 2026-08-25

## Problem

SKU descriptions (e.g. `ccs-telna-base-m1`'s customer-facing wording, polished in migration 033) can currently only be changed by writing a new SQL migration. This is unnecessary friction for a plain-text field that gets revised iteratively as customer-facing wording gets reviewed. The SKUs admin page (`src/pages/SKUs.tsx`) already renders `description` in the detail dialog's "Basic Info" tab, but read-only.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Only the `description` field becomes editable in this change — not `code`, `unit`, or `category` | `code` is a hardcoded FK-like key referenced elsewhere (`managed-pgw-calculator.ts`, `pdf.ts`'s `DEFER_TO_END_SKU_CODES`, per SPEC-023 D5/D6); `category` drives PDF section grouping (SPEC-023 D7). Casual edits to those from this dialog risk silently breaking unrelated features. `description` has no such downstream coupling. |
| D2 | Edit affordance lives in the existing SKU Detail Dialog's "Basic Info" tab: a pencil/edit icon next to the Description field toggles a `Textarea` in place of the static `<p>`, with Save/Cancel buttons | Reuses the existing dialog rather than adding new UI surface; matches the level of the current read-only display |
| D3 | Save wires to the `updateSku` mutation already defined in `SKUs.tsx` (currently only used by the `is_active` `Switch`) | No new mutation needed — same `supabase.from('skus').update(...)` + toast pattern |
| D4 | No autosave-on-blur — explicit Save/Cancel only | Prevents an accidental click-away from silently persisting a half-edited description |
| D5 | Table row's truncated description cell stays read-only (view-only summary); editing only happens in the dialog | Keeps the table scannable; avoids inline-editing a truncated value that hides the full text |

## Guardrails

- **MUST NOT** make `code`, `unit`, or `category` editable in this change
- **MUST** cancel and discard the draft text if the dialog is closed without saving (don't leak edit state across SKUs when a different row is opened)
- **SHOULD** disable Save while the mutation is in flight, consistent with existing loading patterns in this file

## Phases

1. **UI**: add local edit-mode state (`editingDescription: boolean`, `draftDescription: string`) scoped to the currently open dialog; render Textarea + Save/Cancel when editing, static text + edit icon otherwise
2. **Wire mutation**: Save calls `updateSku.mutate({ id: selectedSku.id, description: draftDescription })`; on success, exit edit mode (existing `onSuccess` already invalidates the query and toasts)
3. **Verify**: manually edit a SKU description via `npm run dev`, confirm it persists after dialog close/reopen and after a page refresh
