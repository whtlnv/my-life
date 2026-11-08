# PLAN.md — live plan

`/tdd-deliver` (or `/tdd-supervise`) takes the top undecomposed section, `/plan` decomposes it into TODO items, and each item runs Red→Green→Refactor. Delivered sections are purged from this file once archived. Decisions come from `CLAUDE.md` § Locked decisions. Gaps go to `BACKLOG.md`; anything only the user can do goes to `PENDING_TASKS.md`.

Phases (locked decision 17):

- **Phase 0:** tooling, the Google auth spike, and the calendar walking skeleton — code delivered 2026-11-02 (`DONE.md`); four profiles report since 2026-11-06; the three-day token check is due 2026-11-09 (`docs/phase-0-walkthrough.md`).
- **Phase 1:** Gmail triage on `franciscoc@psmutuus.com`, _advise_ mode, category groups — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through (`docs/phase-1-walkthrough.md`) waits on the extension reload.
- **Phase 2a:** the dashboard redesign (tokens, app shell, _now_ and triage pages) — delivered 2026-11-07 (`DONE.md`, `docs/screenshots/2026-11-07-phase-2a-*.jpg`); new pages reuse `apps/dashboard/src/styles.css` and are screenshot-verified over `scripts/demo.sh`.
- **Phase 2:** Gmail triage on every account, categories with `automatic`, Gmail filters, the weekly expense statement — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through is `docs/phase-2-walkthrough.md`.
- **Phase 2b:** capture: bodies kept locally, extraction v2, contacts and organizations, the Google Contacts import, body backfill and retriage, `GET /search` — code delivered 2026-11-08 (`DONE.md`); the real-account walk-through is `docs/phase-2b-walkthrough.md`.
- **Phase 2c:** rolling digests (system updates, sales, calendar and Drive) with Haiku-written summary lines and one confirm per digest; a _Handled for you_ strip with undo — code delivered 2026-11-08 (`DONE.md`, `docs/screenshots/2026-11-08-phase-2c-*.jpg`); the real-account walk-through is `docs/phase-2c-walkthrough.md`.
- **Phase 3:** the People view (VIP, Urgent computed, Everyone else; contacts and organizations with a merged timeline), the Needs input queue, tasks and the prioritizer, waiting-on.
- **Phase 4:** the in-app agent: chat over mail, contacts, calendar and tasks on Opus, with tools; acts within safeguards (archive, label, draft, task; never delete, never send).
- **Phase 5:** Slack, as a channel in the People view.
- **Phase 6:** WhatsApp and Telegram, read and reply, as channels in the People view.
- **Phase 7:** Gemini meeting notes from Drive.
- **Phase 8:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Phase 1's inputs arrived 2026-11-06 (key in `.env`, `profile/psmutuus.md`). Before the Phase 2b walk-through: § 9 (the contacts scopes; the People API is enabled). Before Phase 5: § 5 (Slack app). Before Phase 6: § 6 (Telegram credentials).

---

## Start here (handoff 2026-11-08, after Phase 2c)

Read `CLAUDE.md` first. **Phases 2b and 2c are delivered** (`DONE.md`). 2c: `packages/domain/src/digests.ts` groups waiting system-update, sales and calendar-drive proposals per account, category and key (the system, or the sender address); `GET /triage-queue` returns `digests` (id, count, severity counts, significant items, summary lines) and `handledForYou`; `POST /digests/:id/confirmation` confirms only the items the page was shown (stored per listing); summary lines come from `apps/backend/src/claude-summary.ts` (`prompts/digest-summary-v1.md`, `MY_LIFE_SUMMARY_MODEL`, default Haiku 5.5, validated by `digestSummary` in contracts, spend logged) and are rewritten when a digest gains or loses an item; `POST /handled-for-you/:messageId/undo` queues an `undo-automatic` command the extension applies. The `createApp` route tests are split by route group (`apps/backend/src/app*.test.ts`, staging in `app.test-support.ts`). **Not yet seen over the real accounts**: everything since 2b waits on `PENDING_TASKS.md` § 9 and one re-consent per profile (`docs/phase-2b-walkthrough.md`, then `docs/phase-2c-walkthrough.md`); the launchd backend runs the pre-2b build until restarted.

**Next:** `/tdd-supervise` on Phase 3. Its first planning question: what "not yet opened" means for the urgent alert rule (moved from 2c; see the Phase 3 bullet). Export `ANTHROPIC_MODEL` as well as passing `--model` to every `claude -p`: `/tdd-cycle` starts nested `claude -p` leaves that only inherit the environment.

What the supervision showed in Phase 2c — check these every cycle:

- **Minimal greens still fake keys and stores:** the digest key left out the category; one `summaryLines` variable served every digest and was asked about every waiting item; the dashboard's "listed" snapshot started in memory. A triangulating item fixed each.
- **A port's real adapter can stay a stub behind a green wiring item:** `createClaudeSummary` ignored its items, had no prompt file, reported no cost and validated nothing until the keystone was split. Read the adapter, not just `main.ts`.
- **Dashboard items pass on mocked responses the backend never sends:** the digest card's significant items had no backend field. Check each field a page reads against the route.
- **Plan defaults drift:** the summary model defaulted to Opus while the plan said Haiku; a settings test pins it now.
- **`/reconcile` refuses to delete a test that also covers unchanged behavior:** migrate it by hand (four triage-queue tests moved to digests).

## Phase 3 — People, Needs input, tasks

Outcome: the second tab shows the user's world by person and organization across channels; the app asks for help in one place; tasks and waiting-on live in the domain; the _now_ page shows the top 3 tasks.

- People view: three lists, VIP (manual mark, seeded from starred contacts and the profile's "always matters"), Urgent (computed, not a list), Everyone else; each sorted by the most recent message. A contact or organization opens to a merged timeline of everything they sent across channels (email now; Slack, WhatsApp, Telegram as later phases land), with thread states, open asks and the user's replies. A message appears under every contact and organization it links to.
- Urgent, computed from config defaults: an ask to the user unanswered for 2 business days; any extracted deadline inside 48 hours; a VIP waiting more than 1 business day; a significant system alert not yet opened (moved from Phase 2c, 2026-11-08: needs the extension to report Gmail's `UNREAD` label, or the app to record when an item was seen; decide which when Phase 3 is planned).
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
