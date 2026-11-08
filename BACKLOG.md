# BACKLOG.md

Deferred refactors and known gaps. Not a queue: `/plan` reads it when decomposing related work, `/backlog-audit` prunes it.

## Config gaps (locked decision 21 says polling defaults are config, not code)

- `apps/backend/src/app.ts` hard-codes the Calendar polling interval (5 min, staleness at twice that) and `businessTimeZone`
  (`America/Mexico_City`); `apps/extension/src/extension-start.ts` hard-codes the same interval, and
  `apps/extension/src/entrypoints/background.ts` the time zone. Promote all four to settings with these defaults when a second
  source (Gmail, Phase 1) needs its own interval.

## Structural

- `apps/integration` runs in the fast loop but has no `test:coverage` script, so `scripts/test.sh` does not count its tests;
  decide whether it joins the coverage floors or is counted separately.

## Out of Scope

- **[apps/extension/src/gmail-archive.ts:6] `CommandOptions` re-declares `AccountRequestOptions`** (added: 2026-11-08)
  Its four fields (`fetch`, `accessToken`, `accountEmail`, `backendUrl`) are the ones `AccountRequestOptions` in
  `apps/extension/src/fetch-function.ts` declares for the body backfill and the contacts import, and `extension-start.ts`
  hands one object to all of them, so a new field is added in two places. Deferred because `gmail-archive.ts` and its
  importer `gmail-filter.ts` are outside b6267f0..HEAD.
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
- **[apps/extension/src/gmail-filter.test.ts:18] Every extension fetch fake re-parses the request URL by hand** (added: 2026-11-07; location corrected 2026-11-07)
  `new URL(input instanceof Request ? input.url : input.toString())` opens 36 fake `fetch` functions across six
  extension test files, so a change to how fakes read a request (a `Request` body, a relative URL) is made 36 times.
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
- **[apps/backend/src/app.ts:225] `createApp` is one 400-line closure holding every route** (added: 2026-11-07; location corrected 2026-11-07)
  The file is 623 lines and every route reads the in-memory `proposals` and `reportedMessages` arrays and the store handles
  through the closure, so a change to one route means reading the whole function. Deferred because splitting it by route
  first needs a shared state object passed to route modules, which is an architectural change for `/complexity-pass`, not
  a mechanical extraction.
- **[apps/backend/src/app.test.ts:243] One 2600-line `describe` with 100 tests covers every route** (added: 2026-11-07; location corrected 2026-11-07)
  Finding the tests for one route means searching the whole file, and its staging helpers (lines 17–236) sit up to 2400 lines above the tests
  that use them. Deferred to the `createApp` split above: the test files should follow the route modules, not come first.
- **[packages/domain/src/expense-statement.ts:26] `localCalendarDate` is defined four times** (added: 2026-11-07)
  Identical `Intl.DateTimeFormat('en-CA', …)` helpers sit in `expense-statement.ts`, `now-view.ts`, `triage-spend.ts` and
  inline in `apps/backend/src/app.ts` `mondayOfBusinessWeek`, so a fix to the business-date rule has to be made four
  times. Deferred because the domain has no shared date module and `now-view.ts` and `triage-spend.ts` are outside
  2aaf298..HEAD.
- **[apps/dashboard/src/filters-page.tsx:46] A fourth dashboard copy of the business time zone** (added: 2026-11-07)
  `timeInBusinessZone` hard-codes `America/Mexico_City`, as `app-shell.tsx`, `triage-page.tsx` and `dashboard-app.tsx` do.
  Deferred to the `dashboard-app.tsx` entry below: no dashboard module holds shared constants, and the time zone is due to
  come from `GET /now` when it becomes a setting.
- **[apps/extension/src/extension-start.ts:8] The extension's 60 s Gmail poll is coupled to the backend's Gmail staleness interval** (added: 2026-11-07)
  `gmailPollIntervalMilliseconds` sets how often the extension really polls, while the backend judges mail staleness by
  `MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS` (default in `apps/backend/src/startup-settings.ts`); setting that variable marks a
  healthy source stale or hides a dead one, and nothing ties the two. Deferred because no shared package holds plain constants,
  and making the extension follow the backend's setting is new behavior.
- **[apps/backend/src/scripted-triage.ts:10] `createScriptedTriage` is shipped source that only its own test calls** (added: 2026-11-07)
  Nothing in `apps/*` imports it (the backend tests stub `propose` inline), so it reads as a live Triage adapter while being dead.
  Deferred because deleting it deletes `scripted-triage.test.ts`, and a refactor pass never deletes a test; it is a
  `/test-quality` matter.
- **[apps/backend/src/app.ts:246] `accountEmailByMessageId` duplicates `reportedMessageStore.accountEmailOf`** (added: 2026-11-07; location corrected 2026-11-07)
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
- **[apps/dashboard/src/dashboard-app.tsx:43] Dashboard hard-codes the business time zone** (added: 2026-11-02; description corrected 2026-11-07)
  This is a third copy of `America/Mexico_City`, alongside the two (backend `app.ts`, extension `background.ts`) in § Config gaps. Deferred to the same change: when the time
  zone becomes a setting, the dashboard should get it from `GET /now`, which changes behavior.
