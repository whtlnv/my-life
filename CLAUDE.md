# CLAUDE.md

Guidance for Claude Code in this repository.

## Project status

**my-life** is the user's personal operator: it reads every input in the user's working life (4+ Google Calendars and Gmail inboxes, 2 Slack workspaces, WhatsApp, Telegram, Google Meet notes, a todo list), triages email with Claude, turns what matters into tasks, prioritizes them and shows one dashboard with _now_ and _later today_. Single user, Chrome only, macOS only, running locally to start. Planned 2026-10-29 via `/grill-me`. Phase 0 code is delivered; its manual walk-through (`docs/phase-0-walkthrough.md`), including the auth spike, waits on `PENDING_TASKS.md` § 1. Phase 1 code (Gmail triage, psmutuus, advise) is delivered; its manual walk-through is `docs/phase-1-walkthrough.md`.

Repository map:

- `PLAN.md` — the live plan. `/tdd-deliver` / `/tdd-supervise` take the top undecomposed section.
- `TODO.md` — working set for the section in delivery. Empty between runs.
- `DONE.md` / `NOT_DONE.md` — append-only ledgers of delivered and bailed items.
- `BACKLOG.md` — deferred refactors and known gaps. Not a queue.
- `MISMATCHES.md`, `TEST_DELETIONS.md` — append-only audits written by `/red` and `/reconcile`.
- `PENDING_TASKS.md` — the user's own to-do list: accounts, credentials, approvals and decisions only the user can provide. **It is not a work queue.** Never start, plan or deliver an entry from it. Work that depends on an unchecked entry waits; an agent that reaches such work skips it and reports the blocker instead of guessing or stubbing around it.
- `docs/decisions/` — dated decision records (spikes, measurements, fidelity gaps).
- `profile/` — the user's hand-written context for the LLM (accounts, people, current priorities). Gitignored except the template.
- `.tdd-test-cmd`, `.tdd-lint-cmd`, `.tdd-clean-cmd` — the commands the TDD skills resolve (written by `/tdd-init`).

## Methodology (non-negotiable)

- **Strict TDD via `/tdd-deliver`** (autonomous) or **`/tdd-supervise`** (cross-cutting phases, or after a bail or stall). Domain logic is TDD-mandatory: triage verdicts, category promotion, filter proposals, prioritization, now/later math, waiting-on ordering, task state, DOM parsers.
- **Tests are co-located with their source** (`foo.ts` next to `foo.test.ts`). Write one test at a time.
- **Lint wall:** `tsc --noEmit` (strict) plus ESLint with zero warnings plus a Prettier check, enforced in CI. Pin every toolchain version in the repo. Bump a pin in its own `chore:` commit.
- **Continuous delivery / XP:** walking skeleton first, then one source at a time, end to end, in thin slices. Small commits; no item takes more than a couple of hours.
- **Measure and control:** test count, suite time, lint state and LLM spend are reported, not guessed. A number in a doc carries a date.
- **Documentation is lean and purged every phase.**
- **Push `main` to `origin` after each phase** (user, 2026-11-07). Never force-push; never push a red tree.
- **The dashboard has one design system:** tokens and component classes in `apps/dashboard/src/styles.css` (Phase 2a). New pages reuse them; a new page never ships unstyled. Presentation work is hand-built and screenshot-verified against `scripts/demo.sh`; its behavior (what a key or button does, what a row shows) stays under test.
- **Tooling comes first.** A dependency must run headless in tests or sit behind an adapter that can. Otherwise reject it.
- **Fastest value wins over enterprise grade.** The user chose local-only, Chrome-only, macOS-only on purpose. Do not add deploy pipelines, multi-user auth or hardening the plan does not ask for.

## Locked decisions (resolved via `/grill-me`, 2026-10-29)

These are settled. Do not relitigate them unless the user raises them.

1. **Scope and posture.** One user, one Mac that is always on, Chrome profiles that are never all closed (one per Google account). Local only to start; the cloud is the last phase. Not enterprise grade: the easiest way to start getting value, then iterate.
2. **Google accounts are a mix of Workspace (the user administers them) and gmail.com.** One code path for all: the extension runs in each Chrome profile and gets tokens through `chrome.identity.getAuthToken` for that profile's signed-in account. One External OAuth consent screen in _Testing_ with every account as a test user. **Phase 0 opens with a spike** that signs in every account and confirms the tokens still mint three days later; the record goes in `docs/decisions/`. Fallback if it fails: IMAP with app passwords plus secret iCal URLs from the backend (calendar read-only, filters exported as XML).
3. **Runtime: a local Node service with SQLite on the Mac**, kept alive by launchd, reachable only on localhost. The extension and the dashboard talk to it over HTTP. `packages/domain` is pure, so moving handlers to Lambda and SQLite to DynamoDB later is an adapter swap, not a rewrite.
4. **Who polls what.** The extension in each profile polls that account's Gmail (history API), Calendar and Drive (Gemini notes) and reports to the backend. The backend polls Slack (user tokens) and Telegram (MTProto user session). WhatsApp is read by a content script in whichever profile has `web.whatsapp.com` open.
5. **Chats are read and replied to from the dashboard.** Telegram through gramjs in the backend (one-time phone login; the Telegram tab becomes optional). WhatsApp through the content script: it reports unread chats and recent messages, and sends a reply by driving the composer. DOM parsers are pure functions tested against saved HTML fixtures.
6. **This app owns tasks.** One-time import from the user's markdown/text list; no sync with any other tool. A task has a title, a source link (email, Slack message, chat, event, note), the account it came from, a priority, an optional due time, a status (`open` / `done` / `snoozed` until a time) and an optional waiting-on person. No recurrence in v1.
7. **Triage autonomy is _advise_ first, promoted per category.** The LLM proposes `archive` / `keep` / `act` (with a task draft) and a reason; the user confirms or rejects in the dashboard with one key. Each category (`action`, `cc-thread`, `expense`, `system-update`, `sales`, `calendar-drive`, `unknown`; set with the user 2026-11-06, see `PLAN.md` Phase 1) has an `automatic` switch the user flips once its proposals look right. Every proposal and verdict is stored, append-only.
8. **Tagging rules are real Gmail filters** created through the Gmail API after the user approves the LLM's proposal (from, subject, list-id → label + skip inbox). They run inside Gmail even when the app is down. App-internal rules do not exist.
9. **The _now_ view** is three blocks: the event happening or starting within 15 minutes, merged across every calendar, with its Meet link; the 3 tasks the prioritizer ranks highest for right now; and the people waiting on a reply (email, Slack, WhatsApp, Telegram) ordered by how long they have waited. **_Later today_** is everything else for the day, time-sorted.
10. **The dashboard is one local web page** (Vite + React) served by the backend; any profile opens the same URL. The extension icon badge shows the count of items needing the user and a click opens the page. No popup, no side panel in v1.
11. **Google Meet contributes two things:** calendar events with a Meet link, and the Gemini meeting-notes docs that land in Drive, whose action items become task proposals. No in-call detection.
12. **Slack: one Slack app, installed with a user token in both workspaces.** The backend polls DMs, mentions and threads the user is in; replies go through `chat.postMessage` as the user.
13. **The LLM's context is a hand-written profile plus verdict history.** `profile/` holds each account's purpose, key people and current priorities; the most recent relevant verdicts are fed back as examples. Prompts are versioned files in the repo. **Claude returns structured output** (tool use validated by zod), never free text to parse. The user's own Anthropic key lives in the local `.env`. Both the per-email classification and the prioritization pass run on Claude Opus 5.5 (`claude-opus-5-5`) to start (user decision 2026-11-06; the user has usage credits and prefers quality first; a cheaper classifier is a later config change, not a rewrite). The model id lives in config, never hard-coded in a prompt or adapter. Spend is logged per call against a daily ceiling in config, default USD 20 per day.
14. **Nudges are pull only.** Badge count and dashboard. No Chrome notifications, no bot messages in v1.
15. **Walking skeleton: the merged calendar _now / next_ across all profiles.** No LLM. It proves the auth spike, the extension in every profile reporting to one backend, account identity and the dashboard.
16. **Test rigor:** `packages/domain` strict TDD; DOM and document parsers tested against fixtures; the `chrome.*` glue thin and verified by a manual checklist plus a screenshot per phase; integration tests against Gmail, Calendar, Slack and Drive **fake HTTP servers** seeded with named scenarios. Never against the user's real accounts from a test.
17. **Phase order:** calendar skeleton → Gmail triage (one account, then all) → tasks and prioritization → Slack → WhatsApp and Telegram → Gemini notes → cloud. Each phase ships end to end before the next starts.
18. **Toolchain:** pnpm monorepo, Node 24, TypeScript strict, Vitest everywhere, ESLint zero warnings, Prettier. Extension built with WXT (Manifest V3). Backend on Hono with `better-sqlite3`. Trunk-based on `main`. CI runs the lint wall and the unit suite on every push; nothing deploys until the cloud phase. UI copy in English (personal app).
19. **Identity:** one user, N linked accounts. Each extension instance registers with the backend using the email of its profile's account; the backend accepts only emails in its allow-list config and only on localhost. There is no login screen.
20. **Privacy and retention:** everything stays on the Mac except what is sent to Anthropic for triage (headers, snippet and body of each email being classified; message text of chats being prioritized). The store keeps ids, headers, snippets, proposals, verdicts and tasks; full bodies are fetched on demand and not kept.
21. **Polling defaults** (config, not code): Gmail every 60 s via history ids, Calendar every 5 min, Drive every 15 min, Slack every 60 s, Telegram on updates, WhatsApp on DOM mutation with a 10 s debounce. Business time zone `America/Mexico_City`.

## Architecture

Kent Beck: what changes together stays together. One monorepo:

```
apps/extension       WXT (MV3). Per profile: Google token, Gmail/Calendar/Drive pollers, WhatsApp content script, badge. Thin: read, post to backend, show count.
apps/backend         Hono on localhost. Routes, SQLite adapters, Slack and Telegram pollers, Claude adapter, schedulers, serves the dashboard build.
apps/dashboard       Vite + React. Now / later today, triage queue, tasks, filters, settings.
packages/domain      Pure TypeScript: triage, categories, filter proposals, prioritization, now/later, waiting-on, task state, parsers, ports. No I/O.
packages/contracts   zod schemas shared by the three apps, including the Claude tool schemas and the extension → backend payloads.
infra                (cloud phase only) CDK app, Floci compose, fakes.
```

- **Decoupling rule:** `packages/domain` must still compile and pass if every `apps/*` package is deleted. A test enforces the dependency direction.
- **Ports and adapters.** Every external need is a port: `MailBox` (Gmail), `Calendar`, `Notes` (Drive), `Workspace` (Slack), `Chat` (WhatsApp, Telegram), `Triage` (Claude), `TaskStore`, `Clock`. The fake and the real adapter pass the same contract suite.
- **No ambient time or randomness in the domain.** `Date.now()`, `new Date()` without arguments and `Math.random()` are lint-banned there; a `Clock` is injected.
- **Events are append-only.** Snapshots of sources, proposals, verdicts, sends and task transitions carry a timestamp; current state is derived.
- **Guardrails live in the domain, never in the prompt:** a category in `advise` never archives on its own; a filter is never created without a stored approval; a reply is never sent without an explicit send action from the dashboard.
- **Google API client rules:** retry 429/5xx with backoff, Gmail reads through `history.list` from the last stored history id with a full resync on `404`, batch `messages.get` with `format=metadata` for triage and `full` on demand.

## Product rules to never break

- Never archive, label, filter or send anything the user did not confirm, unless that category's `automatic` switch is on. Automatic actions are always labeled so they can be found and undone.
- Never send a message to any chat without a send action taken in the dashboard.
- Every task and every triage item links back to its source and says which account it came from.
- Every number shown says when it was fetched; a source that has not reported for longer than twice its polling interval is shown as stale.

## Naming

Identifiers are full English words, never abbreviations. File names are kebab-case (`triage-verdict.ts`, `triage-verdict.test.ts`).
