# BACKLOG.md

Deferred refactors and known gaps. Not a queue: `/plan` reads it when decomposing related work, `/backlog-audit` prunes it.

## Config gaps (locked decision 21 says polling defaults are config, not code)

- `apps/backend/src/app.ts` hard-codes the Calendar polling interval (`pollingIntervalsInMilliseconds.calendar`, 5 min,
  staleness at twice that) and `apps/backend/src/startup-settings.ts` the constant `businessTimeZone`
  (`America/Mexico_City`); `apps/extension/src/extension-start.ts` hard-codes the same interval, and
  `apps/extension/src/entrypoints/background.ts` the time zone. Promote all four to settings with these defaults when a second
  source (Gmail, Phase 1) needs its own interval. (Location corrected 2026-11-08: the backend time zone moved to
  `startup-settings.ts`.)

## Structural

- `apps/integration` runs in the fast loop but has no `test:coverage` script, so `scripts/test.sh` does not count its tests;
  decide whether it joins the coverage floors or is counted separately.
- **[apps/backend/src/app.ts:990] `GET /search` scans every stored message instead of an SQLite FTS5 index** (added: 2026-11-08; location corrected 2026-11-08)
  Phase 2b planned FTS5 over bodies, summaries, extracts and thread states; the delivered route matches words by a linear
  scan, which is enough at today's store size (hundreds of messages). Move to FTS5 when a search is measured slow or the
  agent (Phase 4) needs ranking.

- **[apps/backend/src/app.ts:243] _Handled for you_ lists automatic `keep` proposals, where nothing was done** (added: 2026-11-08)
  `describeHandledForYou` keeps every `madeAutomatic` proposal made today, so an automatic category's `keep` shows in the
  strip and its Undo queues an `undo-automatic` command for a message that was never labeled or archived. List only the
  proposals that produced an archive command or a task. A digest's listed message ids are also overwritten by every
  `GET /triage-queue`, so a second open tab widens what the first tab's confirm reaches.

- **[packages/domain/src/contact-urgency.ts:58] Urgency counts deadlines in messages that only mention a contact, and stops at the first reason** (added: 2026-11-08)
  A contact's messages include every message that names them, so a deadline in Luis's message makes Sofía, merely
  mentioned there, urgent for "deadline"; and `contactUrgency` returns one reason, so her own four-day-old unanswered
  ask never shows. Count deadlines only from messages the contact sent or was asked in, and return every reason.
- **[apps/backend/src/app.ts] The People lists show domains, not organization names, and include automated senders** (added: 2026-11-08)
  `GET /people` gives a sender's domain (`psmutuus.com`) where the import or extraction has a name (Mutuus), and
  Everyone else lists Sentry, AWS and newsletters beside people. Prefer the stored organization name, and leave out
  senders whose messages are all automated mail, as `GET /waiting-on` does.

## Out of Scope

- **[packages/domain/src/task-state.ts:13] The task event `undone` reads as "marked not done" but hides the task** (added: 2026-11-09)
  `POST /agent/actions/undo` saves `{ type: 'undone' }` to withdraw an agent-created task, and `hidesTask` treats it like
  `done`, while `reopened` is what un-does a `done`; a reader takes `undone` for a reopen. Deferred because the type string is
  stored in the task event log and returned by the task history route, which `app-agent.test.ts` pins as `undone`, so a
  rename changes stored data and the API output.
- **[packages/domain/src/agent-action.ts:19] `decideAgentAction` returns `effects` that no caller reads** (added: 2026-11-09)
  `recordingAction` in `apps/backend/src/app.ts` reads only `record.outcome` and runs the tool itself, so `effects` looks
  like the list of actions to perform while nothing performs it. Deferred because `agent-action.test.ts` asserts the field
  in two tests, so dropping it changes the function's tested output; it is a `/test-quality` matter first.
- **[apps/backend/src/app.ts:1214] `GET /people` ignores the urgency time zone, deadline window and VIP wait that main.ts passes** (added: 2026-11-08)
  `readStartupSettings` builds a full `urgency` object and `main.ts` hands it to `createApp`, but `AppOptions.urgency`
  reads only `unansweredAskBusinessDays`; the other three come from `startup-settings.ts`'s defaults, so a setting added
  for them would look live and do nothing. Deferred because honoring them changes what `createApp` does with its options.
- **[apps/dashboard/src/dashboard-app.tsx:160] `millisecondsPerDay` is defined again in the statement page** (added: 2026-11-08)
  `dashboard-app.tsx` (`86_400_000`) and `statement-page.tsx` (`24 * 60 * 60 * 1000`) each define it. Deferred because the
  dashboard has no shared time module to hoist it into, and the statement page's copy goes with its `mondayOf` entry below.
- **[apps/dashboard/src/triage-page.tsx:567] The Handled for you copy spells the backend's automatic label** (added: 2026-11-08)
  The toggle text says items are "labeled my-life/auto", the label `automaticLabelName` in `apps/backend/src/app.ts` puts on
  every automatic archive and its undo removes; renaming the backend constant leaves the dashboard naming a label Gmail no
  longer shows. Deferred for the same reason as the `my-life/archived` entry below: no shared package holds plain constants.
- **[apps/dashboard/src/triage-page.tsx:48] The triage page still renders system sub-groups and sales and calendar-drive group rows** (added: 2026-11-08)
  `GET /triage-queue` now puts every system-update, sales and calendar-drive proposal in a digest and leaves it out of
  `groups`, so `TriageGroup.systems`, `SystemSection` and the `sales` / `calendar-drive` cases of `GroupRows` never render
  live data but read as live. Deferred because `triage-page.test.tsx` pins each of them with a hand-built response, and a
  refactor pass never deletes a test; it is a `/test-quality` matter (the domain's `systems` in `triage-queue.ts` goes with it).
- **[apps/backend/src/app.ts:51] The `/bodies-missing` and `/bodies-report` bodies are declared apart from the extension that sends and reads them** (added: 2026-11-08)
  `BodiesReport` here and the `{ accountEmail, bodies }` post and `BodiesMissing` read in `apps/extension/src/body-backfill.ts`
  must change together, and nothing ties them: a renamed field compiles and the backfill silently stores nothing. Deferred for
  the same reason as the `/triage-queue` and `/now` entries below: there is no contract to share, and adding one is new
  `packages/contracts` surface delivered test-first.
- **[apps/dashboard/src/statement-page.tsx:44] The statement page reads the CSV columns by position, apart from the route that writes them** (added: 2026-11-07)
  `parseStatement` destructures `vendor, amount, currency, date, accountEmail, link` by index, while `GET /expense-statement`
  in `apps/backend/src/app.ts` writes the header `vendor,amount,currency,date,account,link` and the rows in that order; a
  reordered or added column compiles and shows amounts under the wrong heading. Deferred for the same reason as the
  `/triage-queue` and `/now` entries below: there is no statement contract to share the column list from, and adding one is
  new `packages/contracts` surface delivered test-first.
- **[apps/extension/src/gmail-filter.test.ts:18] Every extension fetch fake re-parses the request URL by hand** (added: 2026-11-07; location corrected 2026-11-07; location corrected 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-08)
  `new URL(input instanceof Request ? input.url : input.toString())` opens 31 fake `fetch` functions across eight
  extension test files, so a change to how fakes read a request (a `Request` body, a relative URL) is made 31 times.
  Deferred because two of those files (`calendar-poll.test.ts`, `gmail-poll.test.ts`) sit outside 2aaf298..HEAD and the
  extension has no shared test-helper module to hoist it into.
- **[apps/dashboard/src/statement-page.tsx:112] The statement page computes the business week apart from the backend** (added: 2026-11-07)
  `mondayOf` / `weekStart` (and a second `millisecondsPerDay`) work out the week's Monday from the browser clock in UTC, while
  `GET /expense-statement` in `apps/backend/src/app.ts` uses `mondayOfBusinessWeek` in `America/Mexico_City`; the two must
  agree on which week a `week=` key names, and nothing ties them. Deferred because they disagree on Sunday evenings in
  Mexico City (already Monday in UTC), so unifying them changes which week the previous / next controls request.
- **[apps/extension/src/gmail-archive.ts:4] The extension's fallback archive label is coupled to the backend's** (added: 2026-11-07)
  `archivedLabelName` (`my-life/archived`) repeats the label `GET /commands` in `apps/backend/src/app.ts` puts on every archive
  command, and the backend always sends one, so the fallback looks live and drifts silently if the backend label is renamed.
  Deferred because no shared package holds plain constants, and dropping the fallback changes what a label-less command does.
- **[apps/backend/src/app.ts:377] `createApp` is one 1013-line closure holding every route** (added: 2026-11-07; location corrected 2026-11-07; location corrected 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-08)
  The file is 1464 lines and every route reads the in-memory `proposals` and `reportedMessages` arrays and the store handles
  through the closure, so a change to one route means reading the whole function. Deferred because splitting it by route
  first needs a shared state object passed to route modules, which is an architectural change for `/complexity-pass`, not
  a mechanical extraction.
- **[apps/extension/src/extension-start.ts:8] The extension's 60 s Gmail poll is coupled to the backend's Gmail staleness interval** (added: 2026-11-07)
  `gmailPollIntervalMilliseconds` sets how often the extension really polls, while the backend judges mail staleness by
  `MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS` (default in `apps/backend/src/startup-settings.ts`); setting that variable marks a
  healthy source stale or hides a dead one, and nothing ties the two. Deferred because no shared package holds plain constants,
  and making the extension follow the backend's setting is new behavior.
- **[apps/backend/src/scripted-triage.ts:10] `createScriptedTriage` is shipped source that only its own test calls** (added: 2026-11-07)
  Nothing in `apps/*` imports it (the backend tests stub `propose` inline), so it reads as a live Triage adapter while being dead.
  Deferred because deleting it deletes `scripted-triage.test.ts`, and a refactor pass never deletes a test; it is a
  `/test-quality` matter.
- **[apps/backend/src/app.ts:348] `accountEmailByMessageId` duplicates `reportedMessageStore.accountEmailOf`** (added: 2026-11-07; location corrected 2026-11-07; location corrected 2026-11-08; location corrected 2026-11-08)
  `/mail-report` writes the message's account to both, and `/triage-run` reads the in-memory map while the startup reload reads
  the store, so two sources of the same fact must stay in agreement. Deferred because they disagree when two accounts report the
  same message id (the map keeps the last account, the store's `INSERT OR IGNORE` the first), so dropping either changes behavior.
- **[apps/dashboard/src/triage-page.tsx:39] The `GET /triage-queue` body shape is declared apart from the route that builds it** (added: 2026-11-07; description corrected 2026-11-07)
  `TriageQueueResponse` and `TriageItem` here and `splitActionFromGroups` in `apps/backend/src/app.ts` must change together, and
  nothing ties them: a renamed field compiles and the page reads it as missing. Deferred for the same reason as the `/now` entry
  below: there is no response contract to unify into, and adding one is new `packages/contracts` surface delivered test-first.

- **[apps/dashboard/src/dashboard-app.tsx:32] The `GET /now` body shape is declared apart from the route that builds it** (added: 2026-11-02)
  `NowResponse` here, `{ badgeCount: number }` in `apps/extension/src/badge-refresh.ts` and the object `apps/backend/src/app.ts`
  returns must change together, and nothing ties them: a renamed field compiles and renders an empty dashboard. Deferred because
  there is no `/now` contract to unify into; adding one is new public surface in `packages/contracts`, which the project
  delivers test-first as a planned item.
- **[apps/backend/src/startup-settings.ts:12] Default port 7777 is coupled to the extension's default backend URL** (added: 2026-11-02)
  `defaultPort` and `defaultBackendUrl` in `apps/extension/src/backend-url.ts` must change together, but nothing ties them. Deferred
  because the fix has to edit `backend-url.ts`, which is outside aa9e97f..HEAD, and no existing shared package holds plain
  constants (`packages/contracts` holds zod schemas).
- **[apps/dashboard/src/app-shell.tsx:33] Dashboard hard-codes the business time zone** (added: 2026-11-02; description corrected 2026-11-07; location corrected 2026-11-08)
  `businessTimeZone` here, which every dashboard page imports, is a third copy of `America/Mexico_City`, alongside the two
  (backend `startup-settings.ts`, extension `background.ts`) in § Config gaps. Deferred to the same change: when the time
  zone becomes a setting, the dashboard should get it from `GET /now`, which changes behavior.
