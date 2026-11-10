# Test Deletion Audit

## 2026-11-07 · `apps/backend/src/app.test.ts::carries in each GET /triage-queue group its items, and in a system-update group its sending-system sub-groups with their items` (second copy)

- reason: exact duplicate of the earlier test of the same name in the same file (same report, same triage answers, same assertions; only an inlined `proposalsInOrder` variable differed)
- coverage kept by: `apps/backend/src/app.test.ts::carries in each GET /triage-queue group its items, and in a system-update group its sending-system sub-groups with their items` — `expect(groups.find(({ category }) => category === 'system-update')).toMatchObject({ items: [systemItem], systems: [{ system: 'GitHub', items: [systemItem] }] });` and `expect(groups.find(({ category }) => category === 'expense')).toMatchObject({ items: [expenseItem] });`

## 2026-11-08 · `apps/backend/src/extraction-store.test.ts` (both tests, with `extraction-store.ts`)

- reason: the extraction store was never opened by the app; the proposal store already keeps every proposal, v2 extraction included, append-only under its prompt version (`proposals.prompt_version`), so the store and its two tests pinned dead code
- coverage kept by: `apps/backend/src/app.test.ts::still lists at GET /contacts and GET /organizations, after a backend restart on the same database file, every contact and organization …` (the v2 `people` and `organization` survive a restart) and `apps/backend/src/app.test.ts::asks the triage port again, with the body, on the first POST /triage-run after a restart …` (a `triage-v1` proposal and its `triage-v2` successor stored side by side)

## 2026-11-10 · `apps/integration/src/slack-fake-server.test.ts::in the direct-message scenario lists one DM conversation and returns its message from conversations.history` and `::a poll lists both direct and group direct message conversations, asking conversations.list for types im and mpim`

- reason: Phase 6a.1 retired `conversations.list` from the poll (the real PS Mutuus workspace lists 275 DMs over 2 pages and none of the 18 active ones on page 1); the poll finds DMs through an `is:dm after:` search, and the fake's direct-message scenario no longer lists its DM, as on the real workspace
- coverage kept by: `apps/backend/src/slack-poll.test.ts::never calls conversations.list`, `::stores the messages of a DM conversation that an is:dm search after the date 7 days before now names, though conversations.list does not list it`, and `apps/integration/src/slack-fake-server.test.ts::polling the direct-message scenario stores its DM message …` (now found through the search)
