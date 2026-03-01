# CLAUDE.md

Agent behavior instructions for Claude Code. For project documentation, see `docs/`.

## Project Overview

**Pricing App** — Enterprise B2B SaaS pricing engine and quote management system for telecom/infrastructure products. React 18 + TypeScript + Vite frontend with Supabase (PostgreSQL + Edge Functions) backend.

### Core Pricing Formula

```
Final Price = Base Price × Volume Factor × Term Factor × Env Factor
```

For full pricing details, see `docs/PRICING-OVERVIEW.md`.

## Build & Development Commands

```bash
npm run dev          # Start Vite dev server on http://localhost:5173
npm run build        # TypeScript check + Vite production build
npm run preview      # Preview production build locally
npm run lint         # ESLint
npm run test         # Unit tests in watch mode (Vitest)
npm run test:run     # Unit tests single run
npm run test:coverage # Unit tests with coverage report
npm run test:e2e     # Playwright E2E tests (auto-starts dev server)
npm run test:e2e:ui  # Playwright with interactive UI

# Run a single test file
npx vitest run tests/pricing/volume-pricing.test.ts

# Run tests matching a name pattern
npx vitest run -t "smooth mode"
```

Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) must be set in `.env` — see `.env.example`.

## Code Conventions

- Path alias: `@/*` maps to `./src/*` (use `@/components/...` not relative paths)
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Styling: Tailwind CSS with dark mode (class-based), custom HSL color variables
- Components: PascalCase filenames, one component per file
- Business logic lives in `src/lib/`, not in components
- Unit tests use Vitest with jsdom + `@testing-library/react`. E2E tests use Playwright with Chromium.
- **GB/SIM convention**: The DB column `forecast_scenarios.gb_per_sim` stores **monthly** values. The UI displays **yearly** GB/SIM everywhere (labeled "GB/SIM/yr"). Convert with `× 12` when loading from DB and `/ 12` when saving to DB. The `scenario-generator.ts` functions produce monthly values for DB storage.

## Workflow Rules (Non-Negotiable)

### Spec-Driven Development
1. **Spec First:** Write specification to `docs/` before any code changes
2. **Review Gate:** Ask for user approval before implementing
3. **Task Tracking:** Use Claude Code Tasks to track implementation
4. **Incremental:** One task at a time, mark completed before next

### Agentic Task Execution (Required)

When implementing any spec or feature:

1. **Preflight Check (Always First)**
   - Use `Explore` subagent to analyze the spec document
   - Map spec requirements to current codebase state
   - Identify what exists, what's missing, what needs modification
   - Summarize findings before proceeding

2. **Task Breakdown & Dependencies**
   - Create tasks using `TaskCreate` for each implementation unit
   - Set up dependencies with `TaskUpdate` (addBlockedBy)
   - Identify which tasks can run in parallel
   - Present task graph to user

3. **User Confirmation Gate**
   - **ALWAYS** ask user to confirm before starting tasks
   - Show: task list, dependencies, parallel opportunities
   - Wait for explicit "yes", "start", "continue", or similar

4. **Parallel Subagent Execution**
   - Launch independent tasks in parallel using multiple `Task` tool calls
   - Use `general-purpose` subagent for implementation work
   - Use `Explore` subagent for research/analysis
   - Mark tasks `in_progress` before starting, `completed` when done

5. **Human Checkpoints**
   - After completing parallel task batches, summarize results
   - Ask user to confirm before proceeding to dependent tasks
   - On errors or blockers, stop and ask for guidance
   - Never proceed past a failed task without user input

### Asking Questions
- Use `AskUserQuestion` tool for decision points with 2-4 options
- Use `Explore` subagent for codebase research (not manual Glob/Grep)
- Use `Plan` subagent before complex implementations

## Agent Distribution

For building and maintaining this application, work can be distributed across specialized agents:

### Frontend UI Agent
**Scope:** React components, pages, Tailwind/Shadcn styling, form validation, React Query state

### Backend/Database Agent
**Scope:** Supabase migrations, Edge Functions (Deno runtime), database schemas, RLS policies

### Algorithm/Business Logic Agent
**Scope:** Pricing formulas in `src/lib/`, calculation edge cases, algorithm optimization

### Testing Agent
**Scope:** Vitest unit tests in `tests/pricing/`, Playwright E2E tests in `tests/e2e/`, test fixtures and coverage

### Task Distribution

| Task Type | Primary Agent | Collaboration |
|-----------|---------------|---------------|
| New Admin Page | Frontend UI | Backend (API) |
| Pricing Algorithm | Algorithm | Testing (validation) |
| Database Migration | Backend | Frontend (types) |
| E2E Test Suite | Testing | Frontend (selectors) |
| Bug Fix (UI) | Frontend UI | — |
| Bug Fix (Calc) | Algorithm | Testing (regression) |

### Parallel Execution

Independent streams that can run concurrently:
- **Stream 1:** Frontend pages/components
- **Stream 2:** Backend functions/migrations
- **Stream 3:** Tests

**Synchronization points:** After backend API changes → frontend integration. After algorithm changes → test validation.

## Key Locations

| Path | Purpose |
|------|---------|
| `src/lib/` | Pure business logic: pricing, quotes, scenarios, Excel, PDF |
| `src/pages/` | Route-level page components |
| `src/pages/admin/` | Admin configuration pages |
| `src/components/ui/` | Radix/Shadcn UI primitives |
| `src/types/database.ts` | All TypeScript type definitions |
| `src/contexts/AuthContext.tsx` | Supabase auth state |
| `tests/pricing/` | Unit tests for pricing algorithms |
| `tests/e2e/` | Playwright E2E tests |
| `supabase/migrations/` | SQL migrations (run in order) |
| `supabase/functions/calculate-pricing/` | Edge Function (Deno runtime) |
| `docs/` | Specifications and documentation |
