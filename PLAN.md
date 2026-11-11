# PLAN.md — live plan

`/tdd-deliver` (or `/tdd-supervise`) takes the top undecomposed section, `/plan` decomposes it into TODO items, and each item runs Red→Green→Refactor. Delivered sections are purged from this file once archived. Decisions come from `CLAUDE.md` § Locked decisions. Gaps go to `BACKLOG.md`; anything only the user can do goes to `PENDING_TASKS.md`.

Phases (locked decision 17):

- **Phase 0:** tooling, the Google auth spike, and the calendar walking skeleton — code delivered 2026-11-02 (`DONE.md`); four profiles report since 2026-11-06; the three-day token check is due 2026-11-09 (`docs/phase-0-walkthrough.md`).
- **Phase 1:** Gmail triage on `franciscoc@psmutuus.com`, _advise_ mode, category groups — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through (`docs/phase-1-walkthrough.md`) waits on the extension reload.
- **Phase 2a:** the dashboard redesign (tokens, app shell, _now_ and triage pages) — delivered 2026-11-07 (`DONE.md`, `docs/screenshots/2026-11-07-phase-2a-*.jpg`); new pages reuse `apps/dashboard/src/styles.css` and are screenshot-verified over `scripts/demo.sh`.
- **Phase 2:** Gmail triage on every account, categories with `automatic`, Gmail filters, the weekly expense statement — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through is `docs/phase-2-walkthrough.md`.
- **Phase 2b:** capture: bodies kept locally, extraction v2, contacts and organizations, the Google Contacts import, body backfill and retriage, `GET /search` — code delivered 2026-11-08 (`DONE.md`); the real-account walk-through is `docs/phase-2b-walkthrough.md`.
- **Phase 2c:** rolling digests (system updates, sales, calendar and Drive) with Haiku-written summary lines and one confirm per digest; a _Handled for you_ strip with undo — code delivered 2026-11-08 (`DONE.md`, `docs/screenshots/2026-11-08-phase-2c-*.jpg`); the real-account walk-through is `docs/phase-2c-walkthrough.md`.
- **Phase 3:** the People view (VIP, Urgent computed, Everyone else; contact and organization timelines), Needs input (category and new-sender questions, task proposals), tasks with states and the prioritization pass, waiting-on — code delivered 2026-11-08 (`DONE.md`, `docs/screenshots/2026-11-08-phase-3-*.jpg`); the real-account walk-through is `docs/phase-3-walkthrough.md`. Not built: the "significant alert not yet opened" urgent rule, identity-merge questions and the todo-list import (decisions and `PENDING_TASKS.md` § 4 below).
- **Phase 4:** the in-app agent (the Agent tab): chat over mail, contacts, calendar and tasks on `MY_LIFE_AGENT_MODEL` (default Opus 5.5) under `apps/backend/prompts/agent-v1.md`, cited sources, eight actions through the domain guardrail (`decideAgentAction`; send and delete refused and recorded), a stored action log with undo by action id, the extension's create-draft command — code delivered 2026-11-09 (`DONE.md`); `scripts/demo.sh` seeds it. Not built: FTS5 search and local embeddings (keyword scan still enough); the gaps in `BACKLOG.md` dated 2026-11-09.
- **Phase 5:** Slack in both workspaces (PS Mutuus, Erlia), one app per workspace with the user token in `.env`: the backend polls DMs, group DMs, mentions and threads the user wrote in every 60 s; Slack items in triage (ignore, task, reply), Slack contacts and timelines on the People tab, Slack in waiting-on; replies through `chat.postMessage` only from the dashboard composer — code delivered 2026-11-09 against the Slack fake (`DONE.md`, `docs/screenshots/2026-11-09-phase-5-*.jpg`); `scripts/demo.sh` polls a scripted Slack. The walk-through against the real workspaces is not done. Not built: Slack contacts merged with email contacts (the scopes have no `users:read.email`); the gaps in `BACKLOG.md` dated 2026-11-09.
- **Phase 6:** WhatsApp and Telegram, read and reply, as channels in the People view: **6a Telegram** — code delivered 2026-11-10 against a scripted client (`DONE.md`, `docs/screenshots/2026-11-10-phase-6a-*.jpg`): gramjs behind `apps/backend/src/gramjs-telegram-client.ts`, the chat store `chat-message-store.ts` shared with 6b, `scripts/telegram-login.sh`; the walk-through on the real account is `docs/phase-6a-walkthrough.md` and waits on the one-time login (`PENDING_TASKS.md` § 6). **6a.1** — fixes from the real-account trial, delivered 2026-11-10 and live (`DONE.md`, `docs/screenshots/2026-11-10-phase-6a1-*.jpg`): Slack DMs found through `is:dm` search with a first-poll lookback, one card per conversation, failure logs and chip reasons; Telegram bot digests and media placeholders. **6b WhatsApp** — code delivered 2026-11-11 (`DONE.md`, `docs/screenshots/2026-11-11-phase-6b-*.jpg`, `docs/decisions/2026-11-11-whatsapp-web-structure.md`): the content script `apps/extension/src/entrypoints/whatsapp.content.ts` in the `catala.francisco@gmail.com` profile parses the chat list (with each unread chat's preview) and the open chat, reports through the background's `backend-fetch` relay, and sends dashboard replies by typing into the composer; WhatsApp in triage, waiting-on, People (VIP, timelines) and the header chip. The walk-through with the real page (reload the extension, first report, a first send) is `PENDING_TASKS.md` § 10.
- **Phase 7:** Gemini meeting notes from Drive.
- **Phase 8:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Phase 1's inputs arrived 2026-11-06 (key in `.env`, `profile/psmutuus.md`). Before the Phase 2b walk-through: § 9 (the contacts scopes; the People API is enabled). Before Phase 6: § 6 (Telegram credentials).

---

## Start here (handoff 2026-11-10, after Phase 6a)

Read `CLAUDE.md` first. **Phases 2b through 6a are delivered** (`DONE.md`). Phase 6a added Telegram: `chat-message-store.ts` (one store for every chat channel, keyed by channel, chat id and message id; verdicts append-only), `telegram-message-mapping.ts` (gramjs messages to chat messages; chat ids are marked peer ids), `gramjs-telegram-client.ts` (the port over gramjs, whose real `TelegramClient` type-checks against it in `telegram-connection.ts`), `start-telegram.ts` (unread dialogs, then live messages, started by `createApp` when given a client), `/chat-messages`, `/chat-verdicts`, `/chat-sends`, Telegram in `/now`, `/people`, `/waiting-on` and the triage queue, and the scripted client in `scripted-telegram-client.ts` that tests and `scripts/demo.sh` use.

**Next:** the Phase 6b walk-through on the real WhatsApp page with the user (`PENDING_TASKS.md` § 10), then Phase 7 (Gemini meeting notes, below).

**Waiting on the user**, not built:

- What "not yet opened" means for the significant-alert urgent rule (Gmail's `UNREAD` label, or seen in the app).
- When to propose "same person?" merges, and from what (locked decision 22 says the model proposes them).
- The todo-list import: `PENDING_TASKS.md` § 4 (the path).

What the supervision showed in Phases 3 to 6b — check these every cycle:

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

## Phase 7 — Gemini meeting notes

Outcome: action items from Meet calls become task proposals.

- Extension polls Drive for new "Notes by Gemini" docs per account every 15 min, posts the text.
- Domain: a notes parser extracts action items assigned to the user; each becomes a triage proposal of kind `act` linked to the doc and the calendar event.

## Phase 8 — Cloud

Outcome: the backend runs in AWS and keeps working when the Mac sleeps; the extension and dashboard point at it.

- `infra` CDK app in the marketing-expert shape (Lambda, DynamoDB single table, EventBridge, CloudFront + Google sign-in restricted to the user's emails), Floci locally and in CI.
- `TaskStore` and the other SQLite adapters get DynamoDB twins passing the same contract suites.
- The extension's backend URL becomes a setting; Slack and Telegram pollers move to scheduled Lambdas.
- Decide then whether Gmail and Calendar polling also moves server-side (needs the OAuth path revisited) or stays in the extension.

## Later

- Chrome notifications or a Telegram bot for nudges (locked decision 14 holds until the dashboard proves what deserves an interruption).
- Side panel for the _now_ block.
- In-call detection on `meet.google.com`.
- Recurring tasks.
- Two-way sync with another task tool.
