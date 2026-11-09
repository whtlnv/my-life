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
- **Phase 5:** Slack, as a channel in the People view.
- **Phase 6:** WhatsApp and Telegram, read and reply, as channels in the People view.
- **Phase 7:** Gemini meeting notes from Drive.
- **Phase 8:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Phase 1's inputs arrived 2026-11-06 (key in `.env`, `profile/psmutuus.md`). Before the Phase 2b walk-through: § 9 (the contacts scopes; the People API is enabled). Before Phase 5: § 5 (Slack app). Before Phase 6: § 6 (Telegram credentials).

---

## Start here (handoff 2026-11-09, after Phase 4)

Read `CLAUDE.md` first. **Phases 2b through 4 are delivered** (`DONE.md`). Phase 4 added the Agent tab: conversations stored and resumable; the Claude agent adapter (`apps/backend/src/claude-agent.ts`) sends each turn's tools with descriptions and schemas and offers `cite_sources`; the read tools; the actions go through `decideAgentAction` in `packages/domain/src/agent-action.ts` and land in `agent-action-store.ts`; `POST /agent/actions/undo` takes an action id only; the extension carries out create-draft commands (browser base64, never sends).

**Next:** Phase 5 (Slack). The two apps exist with their user scopes and credentials in `.env`; it starts once each workspace's user token is in `.env` (`PENDING_TASKS.md` § 5).

**Waiting on the user**, not built:

- What "not yet opened" means for the significant-alert urgent rule (Gmail's `UNREAD` label, or seen in the app).
- When to propose "same person?" merges, and from what (locked decision 22 says the model proposes them).
- The todo-list import: `PENDING_TASKS.md` § 4 (the path).

What the supervision showed in Phases 3 and 4 — check these every cycle:

- **Minimal greens build a test-only path beside the real one:** in Phase 4 the undo route took `tool`/`target` from the request and fell through to archive, the domain guardrail had no caller, the real Claude adapter sent no tool definitions, dropped text blocks and returned no citations, and `main.ts` created no agent — every test passed against fake agents. Read the shipped composition and the real adapter before trusting a green.
- **Tests run in Node; the extension runs in a service worker:** a Node `Buffer` in extension code passes every test and fails in Chrome.

- **Mocked dashboard tests hide missing backend fields:** the People page crashed on `lastMessageAt` and `organization` the route never sent; waiting-on returned bare emails. Run the demo and open every new page before the phase closes.
- **The shipped dashboard routes pages in `apps/dashboard/src/main.tsx`, which no test covers:** People and Needs input fell through to Now.
- **Domain rules can be bypassed by the route:** `GET /people` first computed urgency inline, ignoring the domain and the thresholds; task transitions existed only in the domain until route items were added; the prioritization adapter ignored its input. Read the route and the adapter, not just the domain tests.
- **Restart items get greened on the narrowest case:** the task restart passed with one confirmed proposal while done, snooze and waiting-on were not stored.
- **Lint-banned non-null assertions hid two crashes** (an unknown task proposal, a prioritization run with no API key); fix the cause, never the assertion.
- **Tests must not leave temp folders** (`apps/backend/src/test-temp-folder.test-support.ts`); `scripts/clean.sh` removes leftovers.

## Phase 5 — Slack

Outcome: DMs, mentions and threads the user is in from both workspaces join the People view as a channel, feed triage and waiting-on; replies are sent from the dashboard.

- One Slack app per workspace with user scopes (decided with the user 2026-11-09): each workspace's user token (`xoxp-…`) is pasted into `.env` as `MY_LIFE_SLACK_WORKSPACE_<n>_USER_TOKEN` beside its team id; no OAuth flow is built.
- Backend polls `conversations.history` for DMs and `search.messages` for mentions every 60 s per workspace.
- Domain: a Slack message becomes a triage item (`ignore` / `act` / `reply`) and, when unanswered, a waiting-on entry.
- Reply composer in the dashboard → `chat.postMessage` as the user, only on an explicit send.
- Slack fake HTTP server with scenarios.

## Phase 6 — WhatsApp and Telegram

Outcome: unread chats appear in waiting-on and the triage queue; the user replies from the dashboard.

- Telegram: gramjs user session in the backend (`PENDING_TASKS.md` § 6), updates → messages; send through the same session.
- WhatsApp: content script on `web.whatsapp.com` parses the chat list and the open chat into a payload (parsers are pure functions over saved HTML fixtures); posts on DOM mutation with a 10 s debounce; a `send` command from the backend selects the chat and drives the composer.
- Domain: chat messages join triage and waiting-on with the same model as Slack.
- Fixture set for the WhatsApp parser plus a fixture-drift check that fails loudly when a selector matches nothing.

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
