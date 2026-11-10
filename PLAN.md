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
- **Phase 6:** WhatsApp and Telegram, read and reply, as channels in the People view: 6a Telegram, then 6b WhatsApp.
- **Phase 7:** Gemini meeting notes from Drive.
- **Phase 8:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Phase 1's inputs arrived 2026-11-06 (key in `.env`, `profile/psmutuus.md`). Before the Phase 2b walk-through: § 9 (the contacts scopes; the People API is enabled). Before Phase 6: § 6 (Telegram credentials).

---

## Start here (handoff 2026-11-09, after Phase 5)

Read `CLAUDE.md` first. **Phases 2b through 5 are delivered** (`DONE.md`). Phase 5 added Slack: `apps/backend/src/slack-poll.ts` (DMs and group DMs by `conversations.history` with `oldest`, mentions by `search.messages` for `<@own id>`, replies in threads the user wrote in by `conversations.replies`; the own id, workspace name and URL from `auth.test`), `slack-message-store.ts`, `POST /slack-poll` on `main.ts`'s timer, `POST /slack-sends` (refuses empty text and unknown workspaces; stores the sent reply under Slack's `ts`), and the Slack fake in `apps/integration/src/slack-fake-server.ts`.

**Next:** Phase 6 (WhatsApp and Telegram); the Telegram `api_id` and `api_hash` are in `.env` (2026-11-09), the phone login is done with the user during the phase. Also open: the Phase 5 walk-through against the real workspaces (the tokens are in `.env`; the user approves reading them first), and the 2026-11-09 entries in `BACKLOG.md`.

**Waiting on the user**, not built:

- What "not yet opened" means for the significant-alert urgent rule (Gmail's `UNREAD` label, or seen in the app).
- When to propose "same person?" merges, and from what (locked decision 22 says the model proposes them).
- The todo-list import: `PENDING_TASKS.md` § 4 (the path).

What the supervision showed in Phases 3 to 5 — check these every cycle:

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

## Phase 6a — Telegram

Outcome: the user's Telegram private chats and groups appear in triage, in waiting-on and on the People tab; the user replies from the dashboard composer and the reply goes out through the user's own Telegram session. Built against a scripted Telegram client; the real session is checked once with the user.

- **One chat store for both chat channels** (`apps/backend/src/chat-message-store.ts`, SQLite like `slack-message-store.ts`): a message has a channel (`telegram` now, `whatsapp` in 6b), a chat id, a chat title, a message id, a sender id, a sender name, text, an ISO time and whether the user sent it; saving the same channel, chat and message id twice keeps one. Verdicts (ignore, task) are stored append-only beside them. 6b reuses this store unchanged.
- **A Telegram port in the backend** (`TelegramClient`: start with a callback for new messages, list recent messages per dialog, send text to a chat and get the sent message's id back). The real adapter wraps gramjs (`telegram`, pinned at an exact version; a `chore:` commit adds it) with a `StringSession`. The mapping from a gramjs message to a stored chat message is a pure function, tested on constructed messages: private chats and groups are kept; broadcast channels, service messages and messages with no text are dropped; the user's own outgoing messages are marked sent by the user. Tests use a scripted client, never the network.
- **Configuration:** `MY_LIFE_TELEGRAM_API_ID`, `MY_LIFE_TELEGRAM_API_HASH` (already in `.env`) and the session file `MY_LIFE_TELEGRAM_SESSION_PATH` (default `~/Library/Application Support/my-life/telegram-session`, never in git). With the id, hash and a session file, `main.ts` starts the client: on start it stores the recent messages of the dialogs with unread messages (so a restart loses nothing), then every new message as it arrives. Without them Telegram is off and the header says "telegram not logged in".
- **The one-time login:** `scripts/telegram-login.sh` runs a backend script that asks for the phone number, the code Telegram sends and the 2FA password if set, then writes the session file. It is run once with the user (`PENDING_TASKS.md` § 6); the prompts are behind an injectable reader so the flow is tested with scripted answers and a scripted client.
- **Routes:** `GET /chat-messages`, `POST /chat-verdicts` (task creates a task that links back to the chat and says Telegram), `POST /chat-sends` (refuses empty text and a channel that is not configured; on success stores the sent message as sent by the user with the id Telegram returned; a Telegram error answers 502 with the error). Sends are recorded append-only with their time.
- **Triage:** each unanswered Telegram message (the newest message in its chat is not the user's and has no verdict) is a triage item with the chat title, sender, time, a channel pill, and Ignore (`i`), Task (`t`), Reply (`r`) like the Slack card, reusing its classes in `styles.css`; Reply opens the same composer ("Sent as you, only when you press Send").
- **People and waiting-on:** Telegram senders become contacts with a `telegram` handle (their Telegram id, display name as the name); a contact timeline shows Telegram messages with their channel; waiting-on includes Telegram chats whose newest message is not the user's, ordered with email and Slack by how long they have waited; VIP Urgent applies to them.
- **Header:** a Telegram status chip — connected with the time of the last message received or of the last successful start, stale after twice its expected interval without the client connected, "not logged in" when there is no session.
- **Demo:** `scripts/demo.sh` starts the backend with a scripted Telegram client carrying two chats (a private chat from a VIP, a group with a question to the user) and the dashboard shows them; screenshots of triage, People and the composer go to `docs/screenshots/`.
- **Lessons to apply:** the scripted client refuses what gramjs refuses (sending to an unknown chat, an empty message); `main.ts` must create the real client — read the composition, not just the tests; co-located backend tests for the coverage floors.

## Phase 6b — WhatsApp

Outcome: WhatsApp chats from the `web.whatsapp.com` tab appear in triage, waiting-on and People through the same chat store; a reply typed in the dashboard is sent by the content script driving the WhatsApp composer.

- **Content script** (`apps/extension/src/entrypoints/whatsapp.content.ts`, matches `https://web.whatsapp.com/*`) in whichever profile has the tab open (`PENDING_TASKS.md` § 7 default: the first profile). It parses the chat list (title, unread count, last message time) and the open chat's messages (message id from the row's `data-id`, sent by the user when it starts with `true_`, sender and time from `data-pre-plain-text`, text) and posts them to `POST /chat-messages` as channel `whatsapp`, on DOM mutation with a 10 s debounce.
- **Parsers are pure functions over saved HTML fixtures** in `apps/extension/src/`, tested under jsdom (a pinned dev dependency). The first fixtures are hand-written from WhatsApp Web's structure (no real messages in git); `docs/decisions/` records that fidelity gap and the real page is checked once with the user.
- **Fixture drift fails loudly:** when the chat pane is present but a required selector matches nothing, the content script reports a parser failure to the backend instead of an empty list, and the header's WhatsApp chip says "whatsapp parser broken" until a good parse arrives. A test per required selector.
- **Payload schema** in `packages/contracts` (zod), validated on both sides.
- **Send:** `POST /chat-sends` for channel `whatsapp` queues a `send-whatsapp` command (chat title, text) on the existing `GET /commands` queue; the content script selects the chat, types the text into the composer and presses send, then acknowledges; an unacknowledged send shows as pending on the card. Tested against a fixture document.
- **Header:** a WhatsApp chip with the time of the last report, stale after twice the 10 s debounce plus a margin (config), and the parser-broken state.
- **Demo:** `scripts/demo.sh` posts WhatsApp chats; screenshots as in 6a.

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
