# Test Deletion Audit

## 2026-11-07 · `apps/backend/src/app.test.ts::carries in each GET /triage-queue group its items, and in a system-update group its sending-system sub-groups with their items` (second copy)

- reason: exact duplicate of the earlier test of the same name in the same file (same report, same triage answers, same assertions; only an inlined `proposalsInOrder` variable differed)
- coverage kept by: `apps/backend/src/app.test.ts::carries in each GET /triage-queue group its items, and in a system-update group its sending-system sub-groups with their items` — `expect(groups.find(({ category }) => category === 'system-update')).toMatchObject({ items: [systemItem], systems: [{ system: 'GitHub', items: [systemItem] }] });` and `expect(groups.find(({ category }) => category === 'expense')).toMatchObject({ items: [expenseItem] });`
