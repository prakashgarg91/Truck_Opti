# Rules for the 15 parallel Haiku workers (2026-11-18)

Fifteen workers and one database worker are editing this checkout at the same time. Follow these exactly.

1. Touch ONLY the files your brief lists as yours. Read anything.
2. Never create or edit a migration, a `scripts/*.db.test.mjs` file, `scripts/harness/**`, `frontend/src/App.tsx`,
   `frontend/src/types/database.types.ts`, `frontend/src/pages/AgencyInvoicesPage.tsx`,
   `frontend/src/pages/AdminBillingOpsPage.tsx`, `frontend/src/services/agencyInvoicesApi.ts` or
   `frontend/src/services/adminSupabaseApi.ts` unless your brief names it as yours.
3. Never run `npm run test:journey`, the race tests, or the full database suite. Never commit or run git write commands.
4. Verify every audit claim in the code before changing anything. If a claim is wrong, skip it and say why (file:line).
5. Do not invent data, prices, legal text or backend behaviour. If a fix needs a server change, report it instead.
6. Tests: run ONLY your own test files with `cd frontend && npx vitest run <files>`. Then run
   `npx tsc --noEmit -p .` and `npx eslint <your files> --max-warnings 0`. Other workers are mid-edit, so errors in
   files you do not own are expected: ignore them and say so; fix only errors in your files.
7. Never weaken an existing test. Add tests for every behaviour you change.
8. Final message: under 100 words, with files changed, tests run and their counts, claims skipped, and anything
   that needs a server change or an owner decision.
