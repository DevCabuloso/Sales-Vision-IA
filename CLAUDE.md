# SDR Platform

Monorepo: `backend/` (Express + Supabase), `frontend/` (Vue 3 + Vuetify + Pinia), `e2e/` (Playwright, root-level).

## Testing

- Backend unit tests: Vitest, `backend/src/**/*.test.js` (co-located in `__tests__/` folders). Run with `npm run test --prefix backend`.
- Frontend unit tests: Vitest + `@vue/test-utils`, `frontend/src/**/*.test.js`. Run with `npm run test --prefix frontend`.
- Both at once: `npm run test:all` from the repo root.
- E2E: Playwright, `e2e/*.spec.js`, run with `npm run test:e2e` from the repo root (spins up the frontend dev server automatically).

**Before delivering any new feature or fix (i.e. before telling the user the work is done), run `npm run test:all` from the repo root and confirm it passes.** If a change breaks an existing test, fix the regression before considering the task complete — do not silently adjust the test to match broken behavior unless the test itself was asserting the wrong thing.

**Whenever you implement or change something in `backend/src/**` or `frontend/src/**`, create or update the corresponding tests as part of that same change** — not as a separate follow-up task, and not only when the user explicitly asks for tests. Concretely:
- New service/route/composable/store → add a test file alongside it (`__tests__/` folder) covering the main behavior and the error/edge paths, not just the happy path.
- Changed behavior in an already-tested file → update the existing tests to match the new behavior (or add new cases) in the same change, so `npm run test:all` reflects reality afterward.
- Bug fix → add a test that would have caught the bug (regression test) before/alongside the fix.
- Only skip this for things with no meaningful runtime behavior to test (pure config/docs changes, CLAUDE.md itself, etc).

Shared backend test helper: `backend/src/test-utils/supabaseMock.js` — a generic chainable mock for `supabase.from(table)...` that resolves per-table FIFO queues of `{ data, error }` (add any missing query-builder method to `CHAIN_METHODS` there rather than working around it). Use it instead of hand-rolling a new supabase mock in each test file. For Express routes, mock `../middleware/auth.js` (`requireAuth`/`requireTenant`) to inject a fixed `req.user` and use `supertest` against an app that only mounts the router under test.
