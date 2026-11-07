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

- **[apps/extension/src/extension-start.ts:8] The extension's 60 s Gmail poll is coupled to the backend's Gmail staleness interval** (added: 2026-11-07)
  `gmailPollIntervalMilliseconds` sets how often the extension really polls, while the backend judges mail staleness by
  `MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS` (default in `apps/backend/src/startup-settings.ts`); setting that variable marks a
  healthy source stale or hides a dead one, and nothing ties the two. Deferred because no shared package holds plain constants,
  and making the extension follow the backend's setting is new behavior.
- **[apps/backend/src/scripted-triage.ts:10] `createScriptedTriage` is shipped source that only its own test calls** (added: 2026-11-07)
  Nothing in `apps/*` imports it (the backend tests stub `propose` inline), so it reads as a live Triage adapter while being dead.
  Deferred because deleting it deletes `scripted-triage.test.ts`, and a refactor pass never deletes a test; it is a
  `/test-quality` matter.
- **[apps/backend/src/app.ts:147] `accountEmailByMessageId` duplicates `reportedMessageStore.accountEmailOf`** (added: 2026-11-07)
  `/mail-report` writes the message's account to both, and `/triage-run` reads the in-memory map while the startup reload reads
  the store, so two sources of the same fact must stay in agreement. Deferred because they disagree when two accounts report the
  same message id (the map keeps the last account, the store's `INSERT OR IGNORE` the first), so dropping either changes behavior.
- **[apps/dashboard/src/triage-page.tsx:39] The `GET /triage-queue` body shape is declared apart from the route that builds it** (added: 2026-11-07)
  `TriageQueueResponse` and `TriageItem` here and `splitActionFromGroups` in `apps/backend/src/app.ts` must change together, and
  nothing ties them; the page already reads a `fetchedAt` the route never sends. Deferred for the same reason as the `/now` entry
  below: there is no response contract to unify into, and adding one is new `packages/contracts` surface delivered test-first.
- **[packages/domain/src/triage-spend.ts:16] `isTriagePaused` is tested but never called; the backend keeps its own spend-day math** (added: 2026-11-07)
  `apps/backend/src/app.ts` computes the day's spend once at startup (`businessDate`, `spentOnBusinessDateInUsd`) and then only adds
  to it, so the ceiling never resets at business midnight while the process runs; the domain rule recomputes per day. Deferred
  because routing the backend through `isTriagePaused` changes that behavior; it is a planned item, and it also retires the
  duplicate `localCalendarDate`/`businessDate` definitions.
- **[packages/domain/src/current-verdict.ts:1] `currentVerdict` is tested but never called** (added: 2026-11-07)
  The backend takes the first stored verdict per message (`find`/`some` in `apps/backend/src/app.ts`), not the latest. Deferred
  because using the latest verdict changes which decision wins after a re-decision.
- **[packages/domain/src/displayed-category.ts:3] `displayedCategory` is tested but never called** (added: 2026-11-07)
  No route demotes an `action` proposal that is not addressed to the account to `cc-thread`. Deferred because wiring it changes
  what the triage queue shows.

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

- **Triage sends every `profile/*.md` file to Claude, not the account's own.** `apps/backend/src/claude-triage.ts` concatenates the folder (2026-11-07). Fine while Phase 1 triages one account; Phase 2 (every account) needs a per-account selection rule (for example `accounts.md` plus the file named after the account's domain) and a test with two accounts proving only the matching file is sent.

- **Same-category verdict examples cannot be chosen at proposal time.** `chooseVerdictExamples` (`packages/domain/src/verdict-examples.ts`) falls back to verdicts of the message's category, but a message being triaged has no category yet, so the backend's run (`apps/backend/src/app.ts` `verdictExamplesFor`) can only ever supply same-sender examples (2026-11-07). A usable fallback needs a pre-classification key: the sender's domain or the List-Id. Phase 2 material.

- **The triage prompt includes `profile/README.md`.** `apps/backend/src/claude-triage.ts` reads every file in `profile/`, so the folder's own README (instructions for humans) is sent to Claude on every call (2026-11-07, docs-sync). A filter on `README.md` and `*.example.md`, or a per-account selection (see the entry above), fixes both.

