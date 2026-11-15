# Supervision lessons

What supervising Phases 3 to 7 showed. Check these every cycle. The number in brackets is the phase a lesson came from.

- **A poll that never advances its since time passes every test** (7): the notes poll took a since time but nothing fed the next poll the time it returned, so every poll would list and export every notes doc; docs-sync found it, not a cycle. And a since time must not move past a doc whose export failed. Read what the shipped start-up passes between polls.
- **A screenshot finds missing affordances** (7): the notes card had keys but no buttons, and stayed on the page after its verdict until the next refresh.
- **A test beside an extension entrypoint breaks the build, not the suite** (7): WXT read `entrypoints/background.test.ts` as a second `background` entrypoint; CI never builds the extension, so only the wind-up rebuild caught it. `wxt.config.ts` now drops test files from the entrypoints.
- **An uncommitted edit to `TODO.md` stops the driver** (7): the cycle's baseline refuses a dirty tree; commit TODO changes before the next cycle.

- **An outside read finds what green cycles do not** (6c): three read-only Codex audits over a clean export found 37 defects behind a green suite (restart retriage, group confirms overwriting verdicts, Slack pagination, unwaited rate limits). Re-run them after a large phase.
- **A test that compares a whole response blocks adding a field** (6c): migrate it to match on the fields it means (`objectContaining`) in its own commit, never delete it.
- **The plan's picture of a third-party page can be wrong** (6b): WhatsApp Web no longer writes `true_`/`false_` in `data-id`, writes chat-list times as display text, and leaves off-screen rows empty. A masked capture of the real page before building the parser replaced three planned items.
- **Store times in one form** (6b): WhatsApp times arrived with an offset while every other chat stored UTC, and string comparisons ordered them wrongly.
- **A trial on real data finds what fakes cannot** (6a.1): search matches carry no `thread_ts`, display names come back empty, app messages have no `user`, the active DMs sit on page 2 of `conversations.list`, and a cap of 5 messages per conversation hid the app sender that broke the live poll. Run the capped trial on a copy of the store, then watch the first live poll.
- **A new column needs a migration for the live store** (6a.1): `CREATE TABLE IF NOT EXISTS` never adds `chat_is_bot` to an existing table, and rows stored before a mark need it applied on the next save.
- **A stub of a client library is as lenient as a fake API:** in 6a every adapter test passed while the real gramjs calls were wrong (no `NewMessage` builder, so live messages never arrive; string chat ids read as usernames; no `limit`, so one message per chat; unmarked group ids). Type-check the real client against the port, and read the library's types before trusting a green.
- **Contacts listed once per message, not per person:** Slack and Telegram rows on the People tab were built from each message; seed the demo with several messages from one person.
- **A domain rule fed one message cannot see the user's reply:** VIP Urgent never cleared after the user answered, because the route passed only the sender's newest message.
- **Composition code built by minimal greens has no caller:** nothing started the Telegram client until a keystone made `createApp` start it.
- **A fake more lenient than the real API hides broken calls:** in Phase 5 the mention search sent no query, `conversations.list` asked for no DM types, and every poll re-read whole conversations, all green against a fake that answered anything. Make the fake refuse what the real API refuses.
- **The demo screenshots find what tests miss:** team ids instead of workspace names, raw `<@U…>` mentions, the user listed as their own contact, an unstyled card where any key posted a verdict. Look at the demo before calling a page done.
- **Code tested only from `apps/integration` counts for nothing in its own package's coverage floor:** the Slack poll and send route needed co-located backend tests.
- **A busy Mac fails the suite on timeouts** (the shipped backend took 18 s to start at load 34); wait for the load to drop rather than raising timeouts.
- **Minimal greens build a test-only path beside the real one:** in Phase 4 the undo route took `tool`/`target` from the request and fell through to archive, the domain guardrail had no caller, the real Claude adapter sent no tool definitions, dropped text blocks and returned no citations, and `main.ts` created no agent — every test passed against fake agents. Read the shipped composition and the real adapter before trusting a green.
- **Tests run in Node; the extension runs in a service worker:** a Node `Buffer` in extension code passes every test and fails in Chrome.
- **Mocked dashboard tests hide missing backend fields:** the People page crashed on `lastMessageAt` and `organization` the route never sent; waiting-on returned bare emails. Run the demo and open every new page before the phase closes.
- **The shipped dashboard routes pages in `apps/dashboard/src/main.tsx`, which no test covers:** People and Needs input fell through to Now.
- **Domain rules can be bypassed by the route:** `GET /people` first computed urgency inline, ignoring the domain and the thresholds; task transitions existed only in the domain until route items were added; the prioritization adapter ignored its input. Read the route and the adapter, not just the domain tests.
- **Restart items get greened on the narrowest case:** the task restart passed with one confirmed proposal while done, snooze and waiting-on were not stored.
- **Lint-banned non-null assertions hid two crashes** (an unknown task proposal, a prioritization run with no API key); fix the cause, never the assertion.
- **Tests must not leave temp folders** (`apps/backend/src/test-temp-folder.test-support.ts`); `scripts/clean.sh` removes leftovers.
