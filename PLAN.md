# PLAN.md — live plan

`/tdd-deliver` (or `/tdd-supervise`) takes the top undecomposed section, `/plan` decomposes it into TODO items, and each item runs Red→Green→Refactor. Delivered sections are purged from this file once archived. Decisions come from `CLAUDE.md` § Locked decisions. Gaps go to `BACKLOG.md`; anything only the user can do goes to `PENDING_TASKS.md`.

Phases (locked decision 17):

- **Phase 0:** tooling, the Google auth spike, and the calendar walking skeleton — code delivered 2026-11-02 (`DONE.md`); four profiles report since 2026-11-06; the three-day token check is due 2026-11-09 (`docs/phase-0-walkthrough.md`).
- **Phase 1:** Gmail triage on `franciscoc@psmutuus.com`, _advise_ mode, category groups — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through (`docs/phase-1-walkthrough.md`) waits on the extension reload.
- **Phase 2a:** the dashboard becomes a product: design tokens, an app shell, the _now_ and triage pages redesigned, screenshot-verified (user ask 2026-11-07: "improve the UI dramatically"). Hand-built presentation work; behavior stays under test.
- **Phase 2:** Gmail triage on every account, categories with `automatic`, Gmail filters, the weekly expense statement.
- **Phase 3:** tasks and the prioritizer: import, _now_ / _later today_, waiting-on.
- **Phase 4:** Slack.
- **Phase 5:** WhatsApp and Telegram, read and reply.
- **Phase 6:** Gemini meeting notes from Drive.
- **Phase 7:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Phase 1's inputs arrived 2026-11-06 (key in `.env`, `profile/psmutuus.md`). Before Phase 4: § 5 (Slack app). Before Phase 5: § 6 (Telegram credentials).

---

## Start here (handoff 2026-11-07, after Phase 1)

Read `CLAUDE.md` first. **Phase 1's code is delivered** (`DONE.md`): the mail-report and triage-proposal contracts, the domain rules (addressed-to-user, displayed category, verdict effects, queue grouping and ordering, spend ceiling, verdict examples, badge), the backend (mail ingestion, triage runs on a 30-second schedule behind the `Triage` port, append-only proposals, verdicts, spend, archive commands, tasks, check-later, every store in SQLite and restart-safe), the Claude adapter (`prompts/triage-v1.md`, strict `propose_triage` tool from the contract, Opus 5.5, cost from usage), the extension's Gmail poll with history ids, bounded parallel metadata reads, retries, and archive commands carried out and acknowledged, the dashboard's `#/triage` page (action block, groups, keys `t` `k` `a` `r` `c`, removal on accepted verdicts), and the fake Gmail server suite. One live call through the real adapter succeeded. **Not yet seen over the real inbox**: the extension in the psmutuus profile still needs a reload to pick up the `gmail.modify` scope; `docs/phase-1-walkthrough.md` is the checklist and the screenshot item in `NOT_DONE.md` waits on it. Phase 0's three-day token check is due 2026-11-09.

What the supervision showed — check these every cycle:

- **The same four fakes recur:** a constant where a lookup belongs, a list-order shortcut where a date order belongs, an input the green never reads (category, verdict, account email), and two code paths kept alive by test fakes that omit a dependency. Each cost one inserted item; the two-path case (the Claude adapter) was collapsed by hand with a test migration.
- **A contract field or a route the other side already uses must be named in the item** (`/mail-report`, `/commands?accountEmail=…`, `/commands/:id/acknowledgement`, the `due` field): the planner cannot see what the sibling package expects.
- **Persistence is never implied.** Every store started in memory; one restart keystone per store (messages, report times, proposals, spend, verdicts, acknowledgements) made them SQLite.
- **Idle kills after a green commit are routine** (eight this phase): the work was on disk and green each time; commit by hand, tick, move on.
- **The refactor loop needed nine passes** (23 applied) because each extraction exposed the next medium; the test-quality loop four (17 applied, all table folds); complexity one (0).
- Three items were delivered one clause at a time and honestly left open or re-scoped (bundled items, including two of the supervisor's own).

---

## Phase 2a — The dashboard looks like a product

Outcome: the same two pages, redesigned so the user can live in them. Delivered by hand (presentation items are not unit-TDD: `/tdd-supervise` playbook), verified by screenshots over a seeded demo backend, with every existing dashboard test kept green or migrated.

- Design tokens in one stylesheet (`apps/dashboard/src/styles.css`): color (light and dark from `prefers-color-scheme`), type scale on the system font stack, spacing, radii, focus ring. No CSS framework, no web fonts, no network.
- App shell: wordmark, `Now` / `Triage` tabs with the active one marked and the triage count on its tab, one status chip per account (fresh / stale dot, mail and calendar), a keyboard legend on the triage page.
- _Now_ page: the current or next event as one prominent card (time, Join button, attendees), _later today_ as a timeline with a time column and `All day` pinned first, an empty state that reads as designed, the sources table with fetched times.
- Triage page: action cards with the asker, the ask and the due pill first, the account chip, the proposed action, mouse buttons that do what the keys do (`t` `k` `a` `r`), a visible focus ring, and the correction panel inline. Groups as rows with human labels (`Cc threads`, `Expenses`, `System updates`, `Sales pitches`, `Calendar & Drive`), count badges, `Confirm all` (`c`), and category-specific expanded views: expenses as a table, system updates per system with `Significant` marked, sales and calendar-drive as one compact line each, cc threads with what happened since the last message.
- The page refreshes itself (queue every 30 s, now every 60 s) and says how long ago it fetched; the backend sends `fetchedAt` on `/triage-queue` so the page never shows an undefined time.
- A demo backend (`scripts/demo.sh`): a second instance on another port with a throwaway store, seeded with realistic calendar and mail scenarios through a scripted triage, so the UI can be screenshotted without the real inbox. Screenshots land in `docs/screenshots/` dated.
- New pages added in Phase 2 (categories, filters, statement) are built from the same tokens and components.

## Phase 2 — Every account, categories, Gmail filters

Outcome: all inboxes are triaged, trusted categories run automatically, and recurring trivial mail never reaches the inbox again.

- Every profile's extension polls Gmail; the queue is merged and shows the account.
- Category settings page: each category's `advise` / `automatic` switch, with its recent proposals and the agreement rate (confirmed ÷ proposed) shown before the switch. Automatic actions are labeled `my-life/auto`.
- Filter proposals: after K confirmed archives from the same sender or list-id, Claude proposes a Gmail filter (criteria + label + skip inbox); the user approves; the extension creates it through `users.settings.filters.create` (`gmail.settings.basic`). Approvals are stored before creation. A filter page lists what was created and lets the user delete one.
- Kill switch: one toggle returns every category to `advise`.
- Weekly expense statement: every `expense` extract of the week (vendor, amount, currency, date, link to the message) as one file the user sends to accounting.

## Phase 3 — Tasks and the prioritizer

Outcome: the _now_ view shows the 3 tasks that matter right now and who is waiting on the user; the todo list lives here.

- One-time import of the markdown/text list (`PENDING_TASKS.md` § 4): one task per line or checkbox, headings become tags.
- Task state in the domain: `open` / `done` / `snoozed until`; priority; optional due; waiting-on person; every transition append-only.
- Prioritization pass (Opus 5.5 from config, structured output): ranks open tasks given the profile, the calendar for the day and due times; runs on a schedule and on demand; the dashboard shows the rank and the reason; the user can pin a task to the top.
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
