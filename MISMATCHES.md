# TDD Prediction Mismatches

Append-only audit log of `/red` prediction mismatches and their resolutions. Newest first. Never edit or delete prior entries — that destroys the audit trail.

## 2026-11-07 14:10 · `apps/backend/src/app.test.ts::shows at GET /categories a category switched back to advise through PUT /categories/:category/mode after being automatic`
- Behavior: After `PUT /categories/:category/mode` with `advise`, a category previously `automatic` shows `advise` again
- Predicted: passes on first run (read ahead: the previous green stores any posted mode verbatim in `categoryModes`)
- Actual: passes on first run
- Type: passed unexpectedly
- Resolution: The previous green (76cadbd) already covers this behavior, so no rewrite can make the test fail for this behavior alone. The test stays as a regression pin for switching back; the item needs no green step and can be committed as `test:`.

## 2026-11-07 13:56 · `apps/backend/src/app.test.ts::keeps triage paused at POST /triage-run and GET /triage-queue later the same business day after reaching the ceiling, even once the UTC date has changed`
- Behavior: When the daily spend ceiling was reached earlier the same business day, `POST /triage-run` still proposes nothing and `GET /triage-queue` reports `paused: true`
- Predicted: pass. 9969717 already sends `hasReachedDailySpendCeiling` through `isTriagePaused` with business-zone dates, so no right-reason failure was available
- Actual: passed
- Type: passed unexpectedly (relative to Red's contract; it matched the stated prediction)
- Resolution: The behavior arrived with the previous item. I kept the test as a regression pin: the ceiling is hit at 17:30 Mexico City and the clock moves to 19:00, the same business day but the next UTC date. Switching `isTriagePaused` to `timeZone: "UTC"` makes it fail (`message-older` gets asked), so it isn't vacuous. Production was reverted. /green has nothing to implement.

## 2026-11-07 13:44 · `apps/backend/src/app.test.ts::lists at GET /commands the archive command once its rejected archive proposal is re-decided as confirmed through POST /verdicts`
- Behavior: a rejected `archive` proposal that is re-decided as confirmed through `POST /verdicts` lists its archive command at `GET /commands`
- Predicted: pass on first run, because `isStillConfirmed` (apps/backend/src/app.ts) already reads the latest verdict per message
- Actual: passed (1 passed, 65 skipped)
- Type: passed unexpectedly (from the TODO item's premise; the prediction itself matched)
- Resolution: 04a86fd already delivered this behavior. Its latest-verdict filter covers both directions, so no honest failing test exists for this item. The test stays as a pin, and the item needs no green step. `currentVerdict` (ordered by `decidedAt`) is still not called: the backend orders verdicts by insertion, not by `decidedAt`.

## 2026-11-07 03:35 · `apps/integration/src/gmail-fake-server.test.ts::polling the cc-thread scenario shows its two messages as one line, the newest, in the cc-thread group of GET /triage-queue`
- Behavior: Against the `cc-thread` scenario, the thread shows as one line in its group
- Predicted: TypeError `Cannot read properties of undefined (reading 'map')` in the fake server's listing handler (no `cc-thread` scenario), so the poll fails
- Actual: the same TypeError, raised as an uncaught exception inside the fake server; the listing request never gets an answer, so the poll hangs and the test times out (10 s with `--testTimeout=10000`; the default 5 s otherwise)
- Type: right-reason mismatch
- Resolution: A handler that throws in the fake server leaves its request hanging instead of failing the poll. The cause is still the missing scenario, so the test stands. Also noted: the backend's `/triage-run` drops `threadId` and `date` from stored proposals, so every `cc-thread` proposal falls into one thread. Once the scenario exists, a single-thread fixture could pass without real per-thread grouping.

## 2026-11-07 03:29 · `apps/integration/src/gmail-fake-server.test.ts::polling the action-to-me scenario puts the message, addressed to the user, in the action block of GET /triage-queue`
- Behavior: Against the fake Gmail server's `action-to-me` scenario, the message reaches the action block addressed to the user
- Predicted: module resolution error — `./gmail-fake-server` (`startGmailFakeServer`) does not exist yet
- Actual: module resolution error — `"./gmail-poll" is not exported` from `@my-life/extension` (its `exports` lists only `./calendar-poll`)
- Type: right-reason mismatch
- Resolution: The extension's Gmail poller was never wired for the integration package, and Vite resolves that package import before the missing local module; both are missing wiring this test drives, so the test stays as written and green has to add the `./gmail-poll` export and the fake server.

## 2026-11-07 03:25 · `apps/dashboard/src/dashboard-app.test.tsx::still shows the start time of a timed later-today event listed beside an all-day one`
- Behavior: a timed event under _Later today_ still shows its start time when an all-day event is listed next to it
- Predicted: test passes on first run (no failure). The behavior shipped in 1c05340 with the `allDay ? 'All day' : time` branch
- Actual: test passes (1 passed, 14 skipped)
- Type: passed unexpectedly
- Resolution: this TODO item guards against a regression in behavior a prior cycle delivered, so no failing test exists to write. The test was kept as a real guard (it pins `11:00` and no _all day_ on the timed item, with an explicit `allDay: false` beside an all-day event) and was not rewritten to fail artificially. `/green` has nothing to implement.

## 2026-11-07 03:15 · `apps/dashboard/src/triage-page.test.tsx::shows no paused notice when triage is not paused`
- Behavior: When triage is not paused, the page shows no paused notice
- Predicted: passes on first run — `triage-page.tsx:242` already gates the notice on `queue.paused`, delivered by the previous item's green step
- Actual: passed (as predicted)
- Type: passed unexpectedly
- Resolution: the behavior was already delivered as the negative half of "When the ceiling paused triage, the page says so"; the test is kept as a guard (it waits for the remaining count, so it would fail if the notice were rendered unconditionally), and no right-reason failure exists to drive, so /green has nothing to add

## 2026-11-07 01:48 · `apps/dashboard/src/triage-page.test.tsx::takes unknown items from the action list only and renders no unknown group button`
- Behavior: An `unknown` item arrives in the payload's `action` list (as the backend sends it) and shows in the action block; the page renders no `unknown` group button
- Predicted: passes on first run — the page already renders every `queue.action` item, and group buttons come only from `queue.groups`
- Actual: passed (as predicted), so the literal test was vacuous
- Type: passed unexpectedly
- Resolution: The missing behavior is that the page still reads `unknown` items from `groups` (triage-page.tsx:50); the payload now also carries a leftover old-shape `unknown` group holding the same item, and the test fails with 2 cards instead of 1, which drives removing the groups read path.

## 2026-11-06 23:52 · `apps/backend/src/app.test.ts::keeps out of GET /triage-queue after a backend restart on the same database file an item whose verdict was posted before it`
- Behavior: A verdict posted before the backend restarts (same database file) still keeps its item out of the queue after it
- Predicted: passes on first run — `GET /triage-queue` already reads `verdictStore.loadAll()` from SQLite on every request, so no right-reason failure was available
- Actual: passed on first run, as predicted
- Type: passed unexpectedly (relative to the TODO item, which assumed the behavior was missing)
- Resolution: The first verdict item (1046f55) already made verdicts durable by reading them from the store per request; the test is kept as a regression pin (it would fail if verdicts were held in memory), and no rewrite was made because any failing variant would drive a different behavior.

## 2026-11-06 22:23 · `apps/extension/src/gmail-archive.test.ts::creates no second label my-life/archived when the label already exists`
- Behavior: When the label already exists, no second label is created
- Predicted: pass on first run, because `findArchivedLabelId` already returns the existing label's id before any create request
- Actual: passed (1 passed, 2 skipped)
- Type: passed unexpectedly
- Resolution: The previous green (b88ff09) delivered this through its early return. A temporary mutation (`existingLabel !== undefined && false`) made the test fail (`AssertionError`, one label creation instead of none), so it is not vacuous. The production file was restored and the test kept as the regression pin; /green has nothing to add.

## 2026-11-06 21:53 · `apps/extension/src/extension-start.test.ts::posts the Gmail report to the backend with the profile account email`
- Behavior: The report is posted to the backend with the profile's account email
- Predicted: pass (could not predict a right-reason failure: `extension-start.ts` already passes the profile's `accountEmail` to `pollGmailOnce`, which posts it in `/mail-report`)
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: The behavior arrived ahead of its item, in d4f4394/b90750b (the startup Gmail poll), but no test pinned it. A temporary mutation (`accountEmail: 'someone-else@example.com'` in `pollGmail`) made the test fail, so it is not vacuous. The production file was restored and the test kept as the pin; `/green` has nothing to implement.

## 2026-11-06 20:41 · `packages/domain/src/verdict-examples.test.ts::chooses at most the limit of examples even when sender and category verdicts together exceed it`
- Behavior: At most N examples are chosen
- Predicted: passes on first run (`.slice(0, limit)` already caps the combined list)
- Actual: passed (1 passed, 3 skipped)
- Type: passed unexpectedly
- Resolution: The green step for "filled with the most recent verdicts of the same category" already added the cap, so this item is done. The test is kept as a regression pin for the cap across both pools, not rewritten to drive some other behavior.

## 2026-11-06 20:37 · `packages/domain/src/verdict-examples.test.ts::never chooses a verdict from another sender in another category`
- Behavior: Verdicts from another sender in another category are never examples
- Predicted: pass on first run, because `chooseVerdictExamples` already keeps only same-sender verdicts and other-sender verdicts of the same category
- Actual: passed (1 passed, 2 skipped)
- Type: passed unexpectedly
- Resolution: The previous green (9c5dbd7) already delivers this through its two filters. The test was not rewritten, because a failing version would drive a different behavior. To prove it is not vacuous, I temporarily removed the category condition and it failed (`AssertionError`, 3 examples instead of 2), then I reverted it. It stays as a regression pin, and /green has nothing to add.

## 2026-11-06 20:14 · `packages/domain/src/triage-queue.test.ts::shows two waiting cc-thread proposals from different threads as two lines`
- Behavior: Two waiting `cc-thread` proposals from different threads show as two lines
- Predicted: pass on first run, because `newestPerThread` already groups by `threadId`
- Actual: passed (1 passed, 5 skipped)
- Type: passed unexpectedly
- Resolution: the previous cycle's green (keying on `threadId`) already delivers this; any test that fails would assert a different behavior, so the test is kept as a pin against collapsing all threads into one line, and `/green` has nothing to add.

## 2026-11-06 19:06 · `packages/domain/src/addressed-to-user.test.ts::is false when only Cc lists the account address`
- Behavior: A message that lists the account's address only in Cc is not addressed to the user
- Predicted: pass on first run, because `isAddressedToUser` already reads only `to`
- Actual: passed (1 passed, 1 skipped)
- Type: passed unexpectedly
- Resolution: The previous green (1a034a3) already delivers this behavior because it checks only To. The test was kept as a guard so the next item (display name and letter case) cannot widen the match to Cc. It was not rewritten into a failing test, because that would drive a different behavior.

## 2026-11-06 19:01 · `packages/contracts/src/triage-proposal.test.ts::accepts a cc-thread proposal whose extract says what happened since the user's last message`
- Behavior: A `cc-thread` proposal whose extract says what happened since the user's last message passes the shared contract
- Predicted: passes on first run, because `ccThreadExtract` is already `{ sinceLastMessage: z.string() }` and the opening archive-cc-thread test already parses one
- Actual: passed on first run, as predicted
- Type: passed unexpectedly
- Resolution: Earlier items had already shipped this behavior, so no Red test could fail here. I didn't rewrite the test because doing so would invent behavior. To show it isn't vacuous, I temporarily typed `sinceLastMessage` as `z.number()` and the test failed (`ZodError`), then reverted it. The test stays as a regression pin, and /green has nothing to add.

## 2026-11-06 18:11 · `packages/contracts/src/mail-report.test.ts::rejects a report whose message has no id`
- Behavior: A mail report whose message has no id fails the shared contract
- Predicted: passes on first run, because the prior green already made `mailMessage.id` a required `z.string()`
- Actual: passed on first run, as predicted
- Type: passed unexpectedly
- Resolution: The prior item had already shipped this behavior, so no Red test could fail here. I didn't rewrite the test because doing so would invent behavior. To show it isn't vacuous, I temporarily made `id` `.optional()` and the test failed (`expected true to be false`), then reverted it. The test stays as a regression pin, and /green has nothing to add.

## 2026-11-02 13:05 · `apps/dashboard/src/dashboard-app.test.tsx::shows no stale marker on a fresh account`
- Behavior: A fresh account carries no stale marker
- Predicted: passes on first run (the prior green's `{account.stale && ' stale'}` already renders nothing when `stale` is false)
- Actual: passed on first run, as predicted
- Type: passed unexpectedly
- Resolution: The behavior had already shipped with the previous item, so no Red test could fail here. I didn't rewrite the test because doing so would invent behavior. To show it isn't vacuous, I temporarily changed the condition to `true` and the test failed (`Expected element not to have text content`), then reverted it. The test stays as a regression pin, and /green has nothing to add.

## 2026-11-02 11:06 · `apps/backend/src/app.test.ts::replaces an account's events with its newer snapshot in GET /now, dropping an event missing from it`
- Behavior: a second snapshot from the same account replaces its earlier events in GET /now; an event missing from the newer snapshot disappears
- Predicted: AssertionError — `current` lists both the stale event and the new one, because the route appends every snapshot
- Actual: AssertionError — `current` listed only the stale event; the new event was absent because the test gave it a start 5 minutes ahead of the clock, which `buildNowView` files under `next`, not `current`
- Type: right-reason mismatch
- Resolution: the route does append (the stale event stayed), but the test's new event rested on a false premise about `current`; moved its start to before the clock so it is happening now, re-predicted both ids, and got exactly that.

## 2026-11-02 11:00 · `apps/backend/src/app.test.ts::merges the snapshots of two accounts in GET /now, showing a cross-account duplicate once`
- Behavior: two allow-listed accounts post snapshots sharing one iCalUID; GET /now shows that event once naming both accounts, plus the second account's own event
- Predicted: passes on first run — the route appends every accepted snapshot and `mergeCalendarSnapshots` already dedupes by iCalUID
- Actual: AssertionError — `current` had length 1, not 2; the second account's whole snapshot was refused with 400 because the test gave its extra event `meetLink: null`, which the contract (`z.string().optional()`) rejects
- Type: wrong-reason
- Resolution: dropped the null Meet link from the test data (omit the field instead); the test then passes on first run as predicted, so it stays as the pin for this TODO item and `/green` has nothing to write. Side note: the contract accepts a missing Meet link but not `null`; the extension's converter must omit the field rather than send `null`.

## 2026-11-02 10:42 · `packages/domain/src/badge-count.test.ts::does not count an event already in progress`
- Behavior: an event already in progress does not add to the badge count
- Predicted: passes on first run — `badgeCount` is `buildNowView(...).next.length` and `next` already requires `now < event.start`
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: the behavior shipped with the previous cycle's delegation to `buildNowView`; the test is a genuine pin (fails if started events ever enter `next`), kept as-is, no production code needed.

## 2026-11-02 10:25 · `packages/domain/src/now-view.test.ts::leaves an event that has already ended out of later today`
- Behavior: an event whose end is before the clock is not in `laterToday`
- Predicted: passes on first run — `isLaterToday` already requires `horizon < event.start`, and an ended event started before now, so it can never clear the 15-minute horizon
- Actual: passes on first run (1 passed)
- Type: passed unexpectedly
- Resolution: prediction matched; the behavior falls out of the horizon bound added by the later-today green, so the test is kept as the pin for this TODO item and `/green` has nothing to write.

## 2026-11-02 10:05 · `packages/domain/src/now-view.test.ts::does not report an event that has already ended as current`
- Behavior: an event whose end is before the clock is not in `current`
- Predicted: passes on first run — the previous green's filter already requires `now < event.end`
- Actual: passes on first run (1 passed)
- Type: passed unexpectedly
- Resolution: the prior green over-implemented by adding the end bound before its test existed; kept the test as the pin for this TODO item, nothing to make green.

## 2026-11-02 09:51 · `packages/domain/src/merge-calendar-snapshots.test.ts::keeps two events with different iCalUIDs at the same time separate`
- Behavior: two events sharing start and end but with different iCalUIDs survive the merge as two entries
- Predicted: passes on first run, because the merge keys on iCalUID alone and never reads start or end
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: prediction matched; the behavior already exists from the previous cycle, so the test is kept unchanged as a guard against a time-based dedupe and `/green` has no production code to write for this item.

## 2026-11-02 09:35 · `packages/contracts/src/calendar-snapshot.test.ts::rejects a snapshot whose event has no start`
- Behavior: a calendar snapshot whose event has no start fails the shared contract
- Predicted: test passes on first run — `start: z.string()` is already required by the schema from the previous green step
- Actual: test passed on first run, exactly as predicted
- Type: passed unexpectedly
- Resolution: the TODO item restates behavior the first contract item already delivered; the test is kept as a non-vacuous pin (it asserts `safeParse` fails on a real snapshot missing `start`), and `/green` has nothing to implement for it.
