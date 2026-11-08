# Test Deletion Audit

## 2026-11-07 · `apps/backend/src/app.test.ts::carries in each GET /triage-queue group its items, and in a system-update group its sending-system sub-groups with their items` (second copy)

- reason: exact duplicate of the earlier test of the same name in the same file (same report, same triage answers, same assertions; only an inlined `proposalsInOrder` variable differed)
- coverage kept by: `apps/backend/src/app.test.ts::carries in each GET /triage-queue group its items, and in a system-update group its sending-system sub-groups with their items` — `expect(groups.find(({ category }) => category === 'system-update')).toMatchObject({ items: [systemItem], systems: [{ system: 'GitHub', items: [systemItem] }] });` and `expect(groups.find(({ category }) => category === 'expense')).toMatchObject({ items: [expenseItem] });`

## 2026-11-08 · `apps/backend/src/extraction-store.test.ts` (both tests, with `extraction-store.ts`)

- reason: the extraction store was never opened by the app; the proposal store already keeps every proposal, v2 extraction included, append-only under its prompt version (`proposals.prompt_version`), so the store and its two tests pinned dead code
- coverage kept by: `apps/backend/src/app.test.ts::still lists at GET /contacts and GET /organizations, after a backend restart on the same database file, every contact and organization …` (the v2 `people` and `organization` survive a restart) and `apps/backend/src/app.test.ts::asks the triage port again, with the body, on the first POST /triage-run after a restart …` (a `triage-v1` proposal and its `triage-v2` successor stored side by side)
