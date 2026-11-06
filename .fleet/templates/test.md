## Kind: regression test suite for an existing page (NEW test file only; never edit the page)
Goal: pin the CURRENT behaviour of the page so later changes cannot break it silently.
1. Read the page, the services it imports and one finished sibling test for the conventions (frontend/src/pages/AgencyTeamPage.test.ts or AgencyFleetPage.test.ts): react-dom/client + act, vi.hoisted mocks, MemoryRouter when the page uses routing, react-hot-toast mocked.
2. Mock every service/store/supabase import so no network or real client is touched.
3. Cover, as separate named cases: loading state, empty state, error state (and Retry if it exists), the main happy path with real data shapes, each primary action's call arguments, a denied/permission or validation path when the page has one, and any accessibility hook the page already exposes (labels, roles, aria-busy).
4. If the page has a real bug, do NOT fix it and do NOT write a test that asserts the bug as correct: record it as a comment block `// FINDING: ...` at the top of the test file and mention it in your final message.
5. Use a pinned clock (vi.useFakeTimers + vi.setSystemTime, restored in afterEach) for any date logic. Tests must be deterministic: no real timers longer than 50 ms, no randomness.
6. 12 to 25 meaningful cases. Do not weaken or skip any test.
