# PLAN.md — live plan

`/tdd-deliver` (or `/tdd-supervise`) takes the top undecomposed section, `/plan` decomposes it into TODO items, and each item runs Red→Green→Refactor. Delivered sections are purged from this file once archived. Decisions come from `CLAUDE.md` § Locked decisions. Gaps go to `BACKLOG.md`; anything only the user can do goes to `PENDING_TASKS.md`.

Phases (locked decision 17):

- **Phase 0:** tooling, the Google auth spike, and the calendar walking skeleton — code delivered 2026-11-02 (`DONE.md`); four profiles report since 2026-11-06; the three-day token check is due 2026-11-09 (`docs/phase-0-walkthrough.md`).
- **Phase 1:** Gmail triage on `franciscoc@psmutuus.com`, _advise_ mode, category groups — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through (`docs/phase-1-walkthrough.md`) waits on the extension reload.
- **Phase 2a:** the dashboard redesign (tokens, app shell, _now_ and triage pages) — delivered 2026-11-07 (`DONE.md`, `docs/screenshots/2026-11-07-phase-2a-*.jpg`); new pages reuse `apps/dashboard/src/styles.css` and are screenshot-verified over `scripts/demo.sh`.
- **Phase 2:** Gmail triage on every account, categories with `automatic`, Gmail filters, the weekly expense statement — code delivered 2026-11-07 (`DONE.md`); the real-inbox walk-through is `docs/phase-2-walkthrough.md`.
- **Phase 3:** tasks and the prioritizer: import, _now_ / _later today_, waiting-on.
- **Phase 4:** Slack.
- **Phase 5:** WhatsApp and Telegram, read and reply.
- **Phase 6:** Gemini meeting notes from Drive.
- **Phase 7:** cloud.

Before Phase 0 can finish: `PENDING_TASKS.md` § 1 (Google Cloud project and OAuth client). Phase 1's inputs arrived 2026-11-06 (key in `.env`, `profile/psmutuus.md`). Before Phase 4: § 5 (Slack app). Before Phase 5: § 6 (Telegram credentials).

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
