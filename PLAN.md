# PLAN.md — live plan

`/tdd-deliver` (or `/tdd-supervise`) takes the top undecomposed section, `/plan` decomposes it into TODO items, and each item runs Red→Green→Refactor. Delivered sections are purged from this file once archived. Decisions come from `CLAUDE.md` § Locked decisions. Gaps go to `BACKLOG.md`; anything only the user can do goes to `PENDING_TASKS.md`.

Phases (locked decision 17):

- **Phase 0:** tooling, the Google auth spike, and the calendar walking skeleton — code delivered 2026-11-02 (`DONE.md`); four profiles report since 2026-11-06; the three-day token check is due 2026-11-09 (`docs/phase-0-walkthrough.md`).
- **Phase 1:** Gmail triage on `franciscoc@psmutuus.com`, _advise_ mode, category groups — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through (`docs/phase-1-walkthrough.md`) waits on the extension reload.
- **Phase 2a:** the dashboard redesign (tokens, app shell, _now_ and triage pages) — delivered 2026-11-07 (`DONE.md`, `docs/screenshots/2026-11-07-phase-2a-*.jpg`); new pages reuse `apps/dashboard/src/styles.css` and are screenshot-verified over `scripts/demo.sh`.
- **Phase 2:** Gmail triage on every account, categories with `automatic`, Gmail filters, the weekly expense statement — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through is `docs/phase-2-walkthrough.md`.
- **Phase 2b:** capture: full text bodies kept locally, extraction v2 (people, organization, asks, commitments, dates, thread state), Google Contacts import, body backfill and retriage of stored mail (grilled 2026-11-08, `docs/decisions/2026-11-08-product-direction.md`).
- **Phase 2c:** rolling digests replace per-message groups in triage; a _Handled for you_ strip shows automatic work.
- **Phase 3:** the People view (VIP, Urgent computed, Everyone else; contacts and organizations with a merged timeline), the Needs input queue, tasks and the prioritizer, waiting-on.
- **Phase 4:** the in-app agent: chat over mail, contacts, calendar and tasks on Opus, with tools; acts within safeguards (archive, label, draft, task; never delete, never send).
- **Phase 5:** Slack, as a channel in the People view.
- **Phase 6:** WhatsApp and Telegram, read and reply, as channels in the People view.
- **Phase 7:** Gemini meeting notes from Drive.
- **Phase 8:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Phase 1's inputs arrived 2026-11-06 (key in `.env`, `profile/psmutuus.md`). Before Phase 2b: § 9 (People API and the contacts scope). Before Phase 5: § 5 (Slack app). Before Phase 6: § 6 (Telegram credentials).

---

## Start here (handoff 2026-11-08, after Phase 2)

Read `CLAUDE.md` first. **Phase 2's code is delivered** (`DONE.md`, 100 items): per-account profile selection in the triage prompt, the Cc demotion through the domain rule, the latest verdict deciding every effect, the spend ceiling resetting at business midnight, sender-domain and List-Id verdict examples, category modes (`advise` / `automatic`, persisted, automatic decisions recorded per proposal, `my-life/auto` label, kill switch) with their page, filter candidates (three decided archives per sender or List-Id per account) → Claude filter proposals (`prompts/filter-v1.md`, strict `propose_filter`, spend logged) → approval → `create-filter` commands carried out by the extension through the fake-Gmail-proven path → `GET /filters` with times → deletion; the weekly expense statement (domain rule, CSV route, page); `scripts/demo.sh` seeds all of it. **Not yet seen over the real inbox**: the extensions still need a reload for the `gmail.settings.basic` scope; `docs/phase-2-walkthrough.md` is the checklist. Phase 0's three-day token check is due 2026-11-09.

What the supervision showed this phase — check these every cycle:

- **Every store started in memory again** (category modes, automatic decisions, filter approvals, rejections, deletion requests, candidate keys, message dates): one restart keystone each. Plan restart items next to every new store from the start.
- **Mode-at-request-time is the new constant fake:** the first automatic green derived "automatic" from the current mode when `GET /commands` was called; three keystones (recorded decision, later verdict wins, new proposals only) fixed it. Any "setting" that changes behavior needs an item saying _when_ it applies.
- **Items that name two sides get one side:** the adapter clause landed without the backend clause twice (filter candidate messages, delete-filter). Split such items up front.
- **Shape-pinning tests block additive greens:** six `toEqual` on whole response bodies had to be migrated to `toMatchObject` (categories, commands, candidates). Prefer field-subset assertions in route tests.
- **The integration suite catches contract drift the unit tests cannot** (`label` vs `labelName`): one integration item per command type that crosses the backend–extension line.
- **The refactor loop took 15 passes** (39 applied, mostly test-helper extraction in `app.test.ts`); the test-quality loop six (9 applied); complexity one (0). `app.test.ts` is past 3,000 lines: split it by route group before Phase 3 adds tasks.

## Phase 2b — Capture: bodies, extraction v2, contacts

Outcome: nothing the app reads ever has to be read again. Every message's text is on the Mac, every message carries who, what was asked and when, and the user's contacts are known. Decided with the user 2026-11-08 (`docs/decisions/2026-11-08-product-direction.md`).

- The extension reads each message with `format=full` and reports the plain-text body: HTML stripped, quoted replies and signatures trimmed by a pure, fixture-tested function, capped at 20 KB, attachments never. The backend stores it (locked decision 20 amended: bodies stay local). The triage prompt gets the body instead of the snippet.
- Extraction v2, in the same `propose_triage` call (prompt `triage-v2`, cost marginal on Haiku): `people[]` (name, email, role in the message: `sender` / `asked` / `mentioned` / `copied`), `organization` (named, or the sender's domain), `asks[]` (what is asked of the user, with any due date), `commitments[]` (what anyone promised), `dates[]` (every date or deadline mentioned, ISO 8601), `threadState` (one line of where the thread stands after this message). Stored append-only per message and prompt version; the extract shapes of v1 stay.
- Contact and organization records in the domain and SQLite: a contact has a display name, one or more handles per channel (email now; Slack, phone later), an organization, marks (`vip`), lists (free labels), and a note. Organizations are domains or names. Every message links to its contacts and organization by handle; a message with Jean-Louis from Mutuus shows under both.
- Google Contacts: each profile's extension imports its account's contacts and Other Contacts daily through the People API (`contacts.readonly`, `contacts.other.readonly`; `PENDING_TASKS.md` § 9): names, emails, organization, starred, labels. Contacts merge across accounts by email; starred seeds `vip`; a Google label becomes a list; nothing imported overrides a mark the user set in the app.
- Backfill: the backend lists stored messages without a body per account; the extension fetches them (`format=full`) on its poll; the backend retriages every message under v2 with the Haiku-first setup, keeping the verdicts already given and only replacing proposals.
- Full-text index (SQLite FTS5) over bodies, summaries, extracts and thread states, kept in step on every write; `GET /search?q=` for the dashboard and the agent later.
- The profile's narrative stays in `profile/*.md`; structured facts (VIP, lists, merges, per-sender examples) live in the store and are injected per message (the sender's record, the thread state so far) instead of the whole folder.

## Phase 2c — Digests

Outcome: system updates, calendar and Drive, and sales never appear one message at a time.

- A digest is a rolling group per (account, category, system or sender) that accumulates until confirmed; confirming archives or keeps its items by their own proposals and starts a fresh group. Significant items stay listed inside the group.
- Each digest carries one or two Haiku-written lines, rewritten whenever the group changes ("AWS: 5 notices since Tuesday, 1 significant: production budget at 85%"), and the count by severity.
- `Handled for you`: a collapsed strip on the triage page listing what automatic categories did today, each item one click from undo (remove `my-life/auto`, back to the inbox).
- Triage page becomes: Needs you · digests · Needs input (Phase 3 fills it) · Handled for you.
- Urgent signals start here for system alerts: a significant alert not yet opened counts as urgent (thresholds in config: see Phase 3).

## Phase 3 — People, Needs input, tasks

Outcome: the second tab shows the user's world by person and organization across channels; the app asks for help in one place; tasks and waiting-on live in the domain; the _now_ page shows the top 3 tasks.

- People view: three lists, VIP (manual mark, seeded from starred contacts and the profile's "always matters"), Urgent (computed, not a list), Everyone else; each sorted by the most recent message. A contact or organization opens to a merged timeline of everything they sent across channels (email now; Slack, WhatsApp, Telegram as later phases land), with thread states, open asks and the user's replies. A message appears under every contact and organization it links to.
- Urgent, computed from config defaults: an ask to the user unanswered for 2 business days; any extracted deadline inside 48 hours; a VIP waiting more than 1 business day; a significant system alert not yet opened.
- Needs input: a tab with a count in the shell. Each item is one question answered with one key: a category Haiku and Opus disagreed on or `unknown`; a new sender who asked the user for something (VIP or ordinary?); an identity merge candidate (same person?). No daily cap (user decision): every unsettled case waits until answered. Every answer is written to the contact record or the sender's examples and never asked again. Inline recategorize stays on items.
- Tasks: the one-time import of the markdown list (`PENDING_TASKS.md` § 4); task state `open` / `done` / `snoozed until`, priority, optional due, waiting-on person, every transition append-only; the extraction's asks become task proposals.
- Prioritization pass (Opus 5.5 from config, structured output) ranks open tasks given the profile, the calendar, due dates and urgency; on a schedule and on demand; rank and reason shown; the user can pin a task to the top. _Now_ keeps the current event, the top 3 tasks and a short waiting-on list that links into People (locked decision 9 amended).
- Badge becomes: events within 15 min + items needing the user (Needs you, Needs input) + tasks due now.

## Phase 4 — The agent

Outcome: a chat inside the web app that answers questions over everything the app knows and acts within safeguards.

- Claude Opus 5.5 with tools over the local stores: `search_messages` (FTS5), `read_thread`, `contact_timeline`, `calendar_day`, `tasks`, `digest`. Every claim links to the message or event it came from. Conversations are stored locally and resumable.
- Actions, each a tool that goes through the same code path as a dashboard verdict and is recorded append-only: archive and label messages, create a task, mark a contact VIP, approve or reject a filter proposal, write a reply as a Gmail draft (never sent). The agent never deletes anything and never sends; the dashboard shows what the agent did, with undo where the action is reversible.
- Teach through chat: "Luis is my boss, always VIP" updates the contact record like a Needs input answer would.
- Retrieval stays keyword plus structure first; local embeddings (`sqlite-vec`) only if measured recall on real questions proves too weak (record the measurement in `docs/decisions/`).

## Phase 5 — Slack

Outcome: DMs, mentions and threads the user is in from both workspaces join the People view as a channel, feed triage and waiting-on; replies are sent from the dashboard.

- Slack app with user scopes; OAuth install flow served by the backend on localhost; tokens in the local store.
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
