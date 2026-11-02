# PLAN.md — live plan

`/tdd-deliver` (or `/tdd-supervise`) takes the top undecomposed section, `/plan` decomposes it into TODO items, and each item runs Red→Green→Refactor. Delivered sections are purged from this file once archived. Decisions come from `CLAUDE.md` § Locked decisions. Gaps go to `BACKLOG.md`; anything only the user can do goes to `PENDING_TASKS.md`.

Phases (locked decision 17):

- **Phase 0:** tooling, the Google auth spike, and the calendar walking skeleton — code delivered 2026-11-02 (`DONE.md`); the manual walk-through and the auth spike (`docs/phase-0-walkthrough.md`) wait on `PENDING_TASKS.md` § 1.
- **Phase 1:** Gmail triage on one account, _advise_ mode.
- **Phase 2:** Gmail triage on every account, categories with `automatic`, Gmail filters.
- **Phase 3:** tasks and the prioritizer: import, _now_ / _later today_, waiting-on.
- **Phase 4:** Slack.
- **Phase 5:** WhatsApp and Telegram, read and reply.
- **Phase 6:** Gemini meeting notes from Drive.
- **Phase 7:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Before Phase 1: § 2 (Anthropic key) and § 3 (profile). Before Phase 4: § 5 (Slack app). Before Phase 5: § 6 (Telegram credentials).

---

## Start here (handoff 2026-11-02, after Phase 0)

Read `CLAUDE.md` first. **Phase 0's code is delivered** (`DONE.md`, 85 items): contract, domain (merge, now/next/later today, freshness, badge), backend (allow-list, SQLite store, GET /now, dashboard serving, settings from `MY_LIFE_*`), extension (Calendar poll with retries, 5-minute alarm, badge, background glue), fake Calendar server integration suite, dashboard (Now, later today, accounts, loading and error states, live refresh), launchd agent. Nothing has run in a real Chrome profile yet: the walk-through in `docs/phase-0-walkthrough.md`, including the three-day `chrome.identity` spike (locked decision 2), waits on `PENDING_TASKS.md` § 1. When the OAuth client exists: fill `apps/extension/.env` and `.env`, build, `scripts/install-launchd.sh`, walk the checklist, write the spike's `docs/decisions/` record, then `/tdd-supervise` on Phase 1.

What the supervision showed — check these every cycle:

- **Minimal greens ship the first clause and fake the rest.** Twelve keystone or triangulation items were inserted by hand after a green landed a constant (badge count 1, port 4321, fixed Calendar window, settings that ignored their variable, a badge refresh nothing called). Write the discriminating sibling into the plan before the first clause runs, not after.
- **Items that bundle settings or steps get delivered one clause at a time and ticked whole.** Split per setting, per branch.
- **Glue is wired by hand, verified by running it.** `apps/backend/src/main.ts` and `apps/extension/src/entrypoints/background.ts` were composed by the supervisor and smoke-checked (real server, real build), not by a cycle.
- One sizing bail (retry before the pipeline existed) was resolved by inserting the prerequisite item rather than `/plan refine`.
- Quality loops: refactor converged in 2 passes (13 applied), test-quality in 2 (1 applied), complexity in 1; the lint wall was clean after them.

---

## Phase 1 — Gmail triage, one account, advise

Outcome: the oldest-pain inbox is triaged by Claude into `archive` / `keep` / `act` proposals that the user confirms with one key; `act` creates a task.

- Extension polls Gmail through `history.list` from the stored history id (full resync on 404), batches `messages.get` with `format=metadata` plus snippet, posts to `POST /sources/mail`.
- Domain: a `Triage` port; the `TriageProposal` (`archive` / `keep` / `act`, category, reason, optional task draft) validated by zod; a `Verdict` (confirm / reject, with the user's correction) stored append-only; the rule that an `advise` category never archives on its own.
- Claude adapter: versioned prompt files; the `profile/` context plus the N most recent verdicts for the same sender or category as examples; one small-model call per message; spend logged per call against the daily ceiling; a scripted fake in the unit and integration suites.
- Dashboard triage queue: one proposal at a time, keys `a` archive, `k` keep, `t` make task, `r` reject with a correction; shows the reason and the source link.
- Confirmed archive → Gmail `messages.modify` removes `INBOX` and adds label `my-life/archived`; confirmed `act` → a task in the store (title, source link, account).
- Gmail fake HTTP server with scenarios (`newsletter`, `receipt`, `thread-needs-reply`, `history-404`).

## Phase 2 — Every account, categories, Gmail filters

Outcome: all inboxes are triaged, trusted categories run automatically, and recurring trivial mail never reaches the inbox again.

- Every profile's extension polls Gmail; the queue is merged and shows the account.
- Category settings page: each category's `advise` / `automatic` switch, with its recent proposals and the agreement rate (confirmed ÷ proposed) shown before the switch. Automatic actions are labeled `my-life/auto`.
- Filter proposals: after K confirmed archives from the same sender or list-id, Claude proposes a Gmail filter (criteria + label + skip inbox); the user approves; the extension creates it through `users.settings.filters.create` (`gmail.settings.basic`). Approvals are stored before creation. A filter page lists what was created and lets the user delete one.
- Kill switch: one toggle returns every category to `advise`.

## Phase 3 — Tasks and the prioritizer

Outcome: the _now_ view shows the 3 tasks that matter right now and who is waiting on the user; the todo list lives here.

- One-time import of the markdown/text list (`PENDING_TASKS.md` § 4): one task per line or checkbox, headings become tags.
- Task state in the domain: `open` / `done` / `snoozed until`; priority; optional due; waiting-on person; every transition append-only.
- Prioritization pass (stronger model, structured output): ranks open tasks given the profile, the calendar for the day and due times; runs on a schedule and on demand; the dashboard shows the rank and the reason; the user can pin a task to the top.
- Waiting-on block: email threads where the last message is not the user's, ordered by wait time (Slack and chats join in Phases 4 and 5).
- _Later today_ interleaves events and due tasks.
- Badge becomes: events within 15 min + proposals waiting + tasks due now.

## Phase 4 — Slack

Outcome: DMs, mentions and threads the user is in from both workspaces feed the triage queue and the waiting-on block; replies are sent from the dashboard.

- Slack app with user scopes; OAuth install flow served by the backend on localhost; tokens in the local store.
- Backend polls `conversations.history` for DMs and `search.messages` for mentions every 60 s per workspace.
- Domain: a Slack message becomes a triage item (`ignore` / `act` / `reply`) and, when unanswered, a waiting-on entry.
- Reply composer in the dashboard → `chat.postMessage` as the user, only on an explicit send.
- Slack fake HTTP server with scenarios.

## Phase 5 — WhatsApp and Telegram

Outcome: unread chats appear in waiting-on and the triage queue; the user replies from the dashboard.

- Telegram: gramjs user session in the backend (`PENDING_TASKS.md` § 6), updates → messages; send through the same session.
- WhatsApp: content script on `web.whatsapp.com` parses the chat list and the open chat into a payload (parsers are pure functions over saved HTML fixtures); posts on DOM mutation with a 10 s debounce; a `send` command from the backend selects the chat and drives the composer.
- Domain: chat messages join triage and waiting-on with the same model as Slack.
- Fixture set for the WhatsApp parser plus a fixture-drift check that fails loudly when a selector matches nothing.

## Phase 6 — Gemini meeting notes

Outcome: action items from Meet calls become task proposals.

- Extension polls Drive for new "Notes by Gemini" docs per account every 15 min, posts the text.
- Domain: a notes parser extracts action items assigned to the user; each becomes a triage proposal of kind `act` linked to the doc and the calendar event.

## Phase 7 — Cloud

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
