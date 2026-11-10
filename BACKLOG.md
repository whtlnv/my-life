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
- **[apps/backend/src/app.ts:1997] `GET /search` scans every stored message instead of an SQLite FTS5 index** (added: 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-09; location corrected 2026-11-09)
  Phase 2b planned FTS5 over bodies, summaries, extracts and thread states; the delivered route matches words by a linear
  scan, which is enough at today's store size (hundreds of messages). Move to FTS5 when a search is measured slow or the
  agent (Phase 4) needs ranking.

- **[apps/backend/src/app.ts:325] _Handled for you_ lists automatic `keep` proposals, where nothing was done** (added: 2026-11-08; location corrected 2026-11-09)
  `describeHandledForYou` keeps every `madeAutomatic` proposal made today, so an automatic category's `keep` shows in the
  strip and its Undo queues an `undo-automatic` command for a message that was never labeled or archived. List only the
  proposals that produced an archive command or a task. A digest's listed message ids are also overwritten by every
  `GET /triage-queue`, so a second open tab widens what the first tab's confirm reaches.

- **[apps/backend/src/app.ts:1839] The People lists ignore the extraction's organization name and include automated senders** (added: 2026-11-08; rescoped 2026-11-09)
  `GET /people` now prefers a stored contact's organization (the Google Contacts import) but still falls back to the sender's
  domain (`psmutuus.com`) where only the extraction has a name (Mutuus), and Everyone else lists Sentry, AWS and newsletters
  beside people. Fall back to the extraction's organization before the domain, and leave out senders whose messages are all
  automated mail, as `GET /waiting-on` does.

- **[apps/backend/src/main.ts:134] The agent's tools go to Claude with `strict: false`** (added: 2026-11-09)
  The agent tool schemas (`stringInputs` in `app.ts`) do not set `additionalProperties: false`, which strict tool use requires,
  so Claude's tool inputs are only checked for required properties by `claude-agent.ts`. Make the schemas strict and send
  `strict: true` when a malformed tool input is seen in practice, or with the next change to the agent tools.

- **[apps/backend/src/app.ts:614] Each Slack workspace's name, URL and last poll live only in memory** (added: 2026-11-09)
  `slackWorkspacePolls` is filled by `POST /slack-poll`, and `main.ts` first calls it one polling interval after start. Until
  then, after a restart, Slack items show team ids, links fall back to the hand-built `app.slack.com` form, and the source
  chip says never polled. Store the `auth.test` answer per workspace, or poll once at startup.
- **[apps/backend/src/slack-poll.ts:44] The Slack poll asks `users.info` for every message on every poll, and `auth.test` three times** (added: 2026-11-09)
  No cache of display names or of the own user id. Slack's tier limits allow it at today's volume; cache both per poll when a
  workspace with many DMs hits 429s.
- **[apps/backend/src/slack-poll.ts:150] A failed Slack poll is swallowed with no log** (added: 2026-11-09)
  `pollSlackWorkspaces` catches every error (invalid_auth, a missing scope, a changed response shape) and only leaves the
  workspace's last poll time unchanged, so the chip turns stale with no reason given. Log the error and show it on the chip.
- **[apps/backend/src/app.ts:659] Slack sends are listed from memory** (added: 2026-11-09)
  `GET /slack-sends` reads `slackSends`, an array in `createApp`; the sent reply itself is stored in the Slack message store, so
  waiting-on survives a restart, but the send log does not. Store sends append-only like verdicts.

## Out of Scope

- **[apps/dashboard/src/app-shell.tsx:23] The `GET /now` Telegram status shape is declared apart from the route that builds it** (added: 2026-11-10)
  `ShellStatus.telegram` here (`loggedIn`, `lastMessageAt` / `lastStartedAt`, `stale`) and `describeTelegramConnection` in
  `apps/backend/src/app.ts` must change together, and nothing ties them: a renamed field compiles and the chip shows the
  wrong state. Deferred for the same reason as the `/now` entry below: there is no `/now` contract to share, and adding one
  is new `packages/contracts` surface delivered test-first.

- **[apps/backend/src/app.ts:629] Three separate `auth.test` readers** (added: 2026-11-09)
  `fetchSlackWorkspaceIdentity` and `fetchOwnSlackUserId` in `app.ts` and `fetchOwnSlackUserId` in `slack-poll.ts` each
  call `auth.test` and pick fields out of its answer, so a change to how the identity is read has to be made three times.
  Deferred because unifying them sends the app's calls through `callSlack`, which retries on 429 and throws on
  `invalid_auth`. That changes what `POST /slack-poll` and `POST /slack-sends` do when Slack fails.
- **[apps/backend/src/app.ts:985] A task made from a Slack item stores the workspace team id as its `accountEmail`** (added: 2026-11-09)
  `POST /slack-verdicts` saves `accountEmail: verdict.workspaceTeamId`, so a field every reader takes for an email address
  holds `T0001` for Slack tasks. Deferred because the field is stored in the task event log and returned by `GET /tasks`,
  which `app-slack.test.ts` pins, so renaming it (to an account id) changes stored data and the API output.
- **[apps/backend/src/contact-details-store.ts:65] `markedEmails` and `saveMark(email, …)` now hold Slack contact keys too** (added: 2026-11-09)
  `PUT /slack-contacts/:workspaceTeamId/:userId/marks/vip` saves a `slack:<team>/<user>` key through `saveMark`, so
  `markedEmails()` returns keys that are not emails; the local in `GET /people` is renamed `markedContactKeys`, the store is
  not. Deferred because `contact-details-store.ts` sits outside 96c4939..HEAD.
- **[apps/integration/src/slack-fake-server.test.ts:23] One 1284-line file of 52 tests mixes three subjects** (added: 2026-11-09; location corrected 2026-11-09)
  The fake's own answers, `pollSlackWorkspace` against the fake and the backend's Slack routes against the fake share one
  `describe`, so a reader of a failing route test scrolls past the fake's self-tests. Deferred because the split needs test
  files with no sibling source in `apps/integration`, against the project's co-location rule; decide the layout first.

- **[apps/dashboard/src/agent-page.tsx:77] The agent action and conversation shapes are declared apart from the routes that build them** (added: 2026-11-09)
  `AgentAction` and `ConversationSummary` here and `StoredAgentAction` in `apps/backend/src/agent-action-store.ts` (with the
  `GET /agent/conversations` map in `app.ts`) must change together, and nothing ties them: a renamed field compiles and the
  page shows an empty row. Deferred for the same reason as the `/triage-queue` and `/now` entries below: there is no
  contract to share, and adding one is new `packages/contracts` surface delivered test-first.
- **[packages/domain/src/task-state.ts:13] The task event `undone` reads as "marked not done" but hides the task** (added: 2026-11-09)
  `POST /agent/actions/undo` saves `{ type: 'undone' }` to withdraw an agent-created task, and `hidesTask` treats it like
  `done`, while `reopened` is what un-does a `done`; a reader takes `undone` for a reopen. Deferred because the type string is
  stored in the task event log and returned by the task history route, which `app-agent.test.ts` pins as `undone`, so a
  rename changes stored data and the API output.
- **[packages/domain/src/agent-action.ts:19] `decideAgentAction` returns `effects` that no caller reads** (added: 2026-11-09)
  `recordingAction` in `apps/backend/src/app.ts` reads only `record.outcome` and runs the tool itself, so `effects` looks
  like the list of actions to perform while nothing performs it. Deferred because `agent-action.test.ts` asserts the field
  in two tests, so dropping it changes the function's tested output; it is a `/test-quality` matter first.
- **[apps/backend/src/app.ts:1813] `GET /people` ignores the urgency time zone, deadline window and VIP wait that main.ts passes** (added: 2026-11-08; location corrected 2026-11-09; location corrected 2026-11-09)
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
- **[apps/extension/src/gmail-filter.test.ts:18] Every extension fetch fake re-parses the request URL by hand** (added: 2026-11-07; location corrected 2026-11-07; location corrected 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-09)
  `new URL(input instanceof Request ? input.url : input.toString())` opens 32 fake `fetch` functions across eight
  extension test files, so a change to how fakes read a request (a `Request` body, a relative URL) is made 32 times.
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
- **[apps/backend/src/app.ts:422] `createApp` is one 1606-line closure holding every route** (added: 2026-11-07; location corrected 2026-11-07; location corrected 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-09; location corrected 2026-11-09)
  The file is 2126 lines and every route reads the in-memory `proposals` and `reportedMessages` arrays and the store handles
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
- **[apps/backend/src/app.ts:453] `accountEmailByMessageId` duplicates `reportedMessageStore.accountEmailOf`** (added: 2026-11-07; location corrected 2026-11-07; location corrected 2026-11-08; location corrected 2026-11-08; location corrected 2026-11-09)
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
