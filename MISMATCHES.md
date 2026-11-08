# TDD Prediction Mismatches

Append-only audit log of `/red` prediction mismatches and their resolutions. Newest first. Never edit or delete prior entries — that destroys the audit trail.

## 2026-11-08 12:02 · `apps/backend/src/app-mail-triage.test.ts::lists at GET /commands no archive command for an item of a digest confirmed at POST /digests/:id/confirmation whose own proposal is keep`
- Behavior: Confirming a digest queues no archive command for its items whose own proposal is `keep`
- Predicted: passes on first run — `GET /commands` already filters proposals to `action === 'archive'` (apps/backend/src/app.ts:726), and the previous cycle's digest confirmation only saves verdicts
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: The behavior came with the previous item's green step. A rewrite cannot make it fail without changing the behavior, so the test stays as a guard. A temporary mutation that dropped the archive filter made it fail (`message-advisory` listed), so the pass is not vacuous; the mutation was reverted.

## 2026-11-08 11:42 · `packages/domain/src/digests.test.ts::does not list its items that are not significant`
- Behavior: A digest does not list its items that are not significant
- Predicted: pass on first run: the previous green computed `significantItems` as `proposals.filter(isSignificant)`, which already drops items whose extract is not `significant: true`
- Actual: pass (1 passed, 11 skipped)
- Type: passed unexpectedly
- Resolution: the previous green built the filter, not just the listing; the test is kept as a pin for the negative case, because no honest rewrite can fail without removing production code

## 2026-11-08 11:33 · `packages/domain/src/digests.test.ts::places two calendar-drive proposals from the same account and different sender addresses in two digests even when they name the same item`
- Behavior: Two calendar-drive proposals from the same account and different sender addresses are in two digests
- Predicted: pass on first run, and tsc clean: `digestKey` keys every non-`system` extract on the sender address, and the previous green already added `{ item, change }` to `DigestableExtract`
- Actual: pass (1 passed, 7 skipped); tsc clean
- Type: passed unexpectedly
- Resolution: The behavior already exists, so no failing version can be written without making up new behavior. I kept the test as a pin, with both proposals naming the same item so it catches a regression to keying on the item. A throwaway mutation that keyed on `extract.item` made it fail; the source was then restored. `/green` has nothing to implement.

## 2026-11-08 11:30 · `packages/domain/src/digests.test.ts::places two calendar-drive proposals from the same account and the same sender address in one digest keyed by that address`
- Behavior: Two calendar-drive proposals from the same account and the same sender address are in one digest
- Predicted: the Vitest run passes (digestKey already falls back to the sender address when the extract has no `system`); tsc fails with TS2345 because `{ item, change }` is not in DigestableProposal's extract union
- Actual: the Vitest run passes; tsc fails with TS2322 (same cause: `{ item, change }` cannot be assigned to `{ system } | { company }`)
- Type: right-reason mismatch
- Resolution: The runtime behavior already exists because of the fallback. The missing piece is the type contract, so the red is carried by the typecheck, and /green only has to widen DigestableProposal's extract. The error code differs only because TypeScript reports the assignment, not an argument.

## 2026-11-08 11:27 · `packages/domain/src/digests.test.ts::places two sales proposals from the same account and different sender addresses in two digests even when they name the same company`
- Behavior: two sales proposals from one account but different sender addresses are in two digests
- Predicted: passes on first run (read beforehand: `digestKey` already keys sales on `from`), so no right-reason failure was available
- Actual: passed (1 passed, 4 skipped)
- Type: passed unexpectedly
- Resolution: the previous green (8a45783, "same sender address are in one digest") already implemented this; no failing shape exists without inventing new behavior, so the test was kept as a pin, with both pitches naming the same company so it would catch a regression to keying on company. It was not rewritten. `/green` has nothing to implement.

## 2026-11-08 05:06 · `apps/backend/src/app.test.ts::still lists at GET /search?q= after a backend restart on the same database file a message whose body was reported before it`
- Behavior: search results survive a backend restart
- Predicted: pass — `createApp` reloads every reported message with its body and the latest proposal per message from SQLite, and `GET /search` filters those in-memory arrays, so nothing is left to persist
- Actual: pass — assertion met on the first run
- Type: passed unexpectedly
- Resolution: The item assumed a search index that would need to persist or rebuild; the search is a filter over data already reloaded at startup, so the behavior exists and no variant (body, backfilled body, summary) can fail. Kept the test as a test-after pin of the restart path; nothing to turn green.

## 2026-11-08 05:02 · `apps/backend/src/app.test.ts::lists at GET /search?q= a message stored after an earlier search, without a rebuild`
- Behavior: a message stored after the search index was built is found by `GET /search?q=` without a rebuild
- Predicted: pass — the handler scans the live in-memory message array on every request and `/mail-report` pushes into that same array; there is no index to rebuild
- Actual: pass — 1 passed
- Type: passed unexpectedly
- Resolution: the TODO item presumed a built index that does not exist yet (search is a linear scan); the test stays as a pin so a future stored index keeps finding late messages, and `/green` has nothing to write.

## 2026-11-08 03:56 · `apps/backend/src/app.test.ts::lists at GET /bodies-missing?account= neither a message of that account reported with a body nor a body-less message of another account`
- Behavior: `GET /bodies-missing?account=` lists no message of another account and no message that has a body
- Predicted: pass on first run — the previous Green (`5ac425f`) already filtered on `accountEmail` and `body === undefined`, beyond what its own test required
- Actual: pass on first run
- Type: passed unexpectedly
- Resolution: kept the test as the pin for this TODO item instead of rewriting it; a throwaway mutation of the route filter made it fail with `message-2` and `message-3` listed, so it is not vacuous (the route was restored); the first-run pass is a sign the earlier Green over-implemented its item.

## 2026-11-08 03:47 · `apps/integration/src/people-fake-server.test.ts::importing the starred-client-and-other-contact scenario lists at GET /contacts the starred client as vip with its organization and list, and the other contact by name and email`
- Behavior: the contacts import, from the extension against the fake People server to the stored contacts, ends with the contacts readable from the backend
- Predicted: module-load error, `./people-fake-server` cannot be found because the fake People server does not exist yet
- Actual: module-load error one import earlier, `"./contacts-import" is not exported` from `@my-life/extension` (the package's `exports` map lists only `calendar-poll`, `gmail-archive`, `gmail-filter` and `gmail-poll`)
- Type: right-reason mismatch
- Resolution: the extension package exposes its pollers to the integration suite through an explicit `exports` allow-list, which every fake-server test before this one extended; exposing `contacts-import` there is part of the wiring this item drives, so the test stands as written and the actual failure is accepted; the missing fake server surfaces next.

## 2026-11-08 03:13 · `apps/backend/src/app.test.ts::lists at GET /contacts, after POST /contacts-import brings unstarred a contact the user marked vip through PUT /contacts/:email/marks/vip, that contact still with the vip mark`
- Behavior: An unstarred imported contact does not remove a `vip` mark the user set in the app
- Predicted: pass — the import handler only calls `saveMark` when `starred` is true and never removes a mark, and marks live in `contact_marks`, which the details `save` does not touch
- Actual: pass
- Type: passed unexpectedly (predicted, but not a right-reason failure)
- Resolution: the item had no missing behavior, so the test stays as a guardrail pin after proving it non-vacuous (temporarily removing the `vip` mark on an unstarred import makes it fail with `marks: []`; production restored, `git diff` touches only the test file).

## 2026-11-08 01:31 · `apps/backend/src/app.test.ts::still lists at GET /contacts and GET /organizations, after a backend restart on the same database file, every contact and organization with the messages linked to them before it: the senders, the person the extraction named and the organization it named, with nothing reported or triaged again`
- Behavior: Contacts, organizations and message links survive a backend restart
- Predicted: pass — senders come from the reported-message store and the proposals array is reloaded at startup from the proposal store, whose JSON already carries `people` and `organization`
- Actual: `AssertionError` on the organizations assertion first (wrong reason: `localeCompare` orders `acme.com` before `Mutuus`, my expected order was wrong); after fixing the expected order, pass as predicted
- Type: wrong-reason, then passed unexpectedly (predicted, but not a right-reason failure)
- Resolution: the item had no missing behavior, so the test stays as a guardrail pin after proving it non-vacuous (temporarily dropping `people` and `organization` from the proposals reloaded at startup makes it fail with Pedro's contact missing; production restored, `git diff` touches only the test file).

## 2026-11-08 01:15 · `apps/backend/src/app.test.ts::lists a message under no contact it does not link to: a second message from another sender, whose extraction names nobody, appears under its sender alone, not under the first sender or the person the first message names`
- Behavior: A message lists under no contact it does not link to
- Predicted: pass — `contactsByEmail` links each sender and each extracted person to the one message id it came from, so a second message can only appear under its own sender
- Actual: pass
- Type: passed unexpectedly (predicted, but not a right-reason failure)
- Resolution: the previous greens already scope every link to its own message, so the item had no missing behavior; kept the test as a guardrail pin after proving it non-vacuous (temporarily linking each extracted person to every reported message makes it fail with `pedro@acme.com` also listing `message-2`; production restored, `git diff` touches only the test file).

## 2026-11-08 01:09 · `apps/backend/src/app.test.ts::lists a reported message that is not yet triaged under both parties it links to: its sender contact and the organization of its sender's domain`
- Behavior: One message lists under every contact and organization it links to
- Predicted: pass — the natural reading (one triaged message under its sender, two extracted people and the named organization) was already covered by the previous green's per-person link loop
- Actual: pass — vacuous as a Red; no behavior was missing in that slice
- Type: passed unexpectedly
- Resolution: Rewrote to the slice of the item that is genuinely missing — a reported, not yet triaged message lists under its sender contact but under no organization, because `/organizations` derives its links from proposals only; the rewritten test fails with `AssertionError` (got `['luis@example.com']`, expected `['example.com', 'luis@example.com']`).

## 2026-11-08 00:46 · `apps/backend/src/app.test.ts::lists at GET /organizations a message once, under the organization its latest proposal names, when the store holds two proposals for it`
- Behavior: a message proposed twice lists once at `GET /organizations`, under the organization its latest proposal names
- Predicted: pass — startup already collapses the stored proposals to the latest row per message before the route sees them
- Actual: pass
- Type: passed unexpectedly
- Resolution: the behavior already exists (the startup dedupe added for the triage queue covers the organizations route too) and the backend has no in-process path that proposes a message twice before the retriage items, so the test could not be rewritten to fail without inventing retriage; kept as a pin of the latest-proposal-wins keystone for `/organizations`.

## 2026-11-08 00:31 · `apps/backend/src/app.test.ts::lists at GET /contacts two contacts for two messages from different emails`
- Behavior: two messages from different emails link to two contacts
- Predicted: AssertionError — one contact received instead of two, the sender map collapsing senders
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: the previous green ("same email on different accounts → one contact") keyed `contactsFromSenders` by email, which already yields one contact per distinct email; the test is a genuine pin of that behavior, not a vacuous pass, so it is kept as-is without a rewrite.

## 2026-11-07 17:00 · `apps/backend/src/app.test.ts::lists no create-filter command at GET /commands for a pending filter proposal that was never approved`
- Behavior: A filter proposal with no stored approval never yields a `create-filter` command
- Predicted: passes on first run (read `app.ts` first: `GET /commands` already filters filter proposals through `approvedFilterProposalIds`)
- Actual: passes on first run
- Type: passed unexpectedly
- Resolution: The previous green (approval → create-filter command) already gated on approval, so this TODO item had no missing behavior; kept the test as a guardrail pin after proving it non-vacuous (removing the approval check makes it fail with one create-filter command listed).

## 2026-11-07 16:53 · `apps/backend/src/app.test.ts::lists at GET /filter-proposals each pending filter proposal with its criteria, label, account and the count of archives behind it`
- Behavior: `GET /filter-proposals` lists pending proposals with criteria, label, account and the count of archives behind each
- Predicted: AssertionError — status 404 instead of 200, no such route
- Actual: SyntaxError — `response.json()` throws on Hono's plain-text `404 Not Found` body before the assertion runs
- Type: right-reason mismatch
- Resolution: the route is indeed missing; the unrouted 404 is not JSON, so the failure surfaces at body parsing. Accepted as is: once the route exists it answers JSON and the assertion decides.

## 2026-11-07 15:18 · `apps/backend/src/app.test.ts::lists no archive command at GET /commands for a new archive proposal in a category that was automatic before POST /categories/kill-switch, until it is confirmed`
- Behavior: After the kill switch, a new `archive` proposal in a category that was `automatic` yields no command until confirmed
- Predicted: pass on first run. The kill switch writes `advise` to the same mode store that is read when a proposal is made, so the behavior falls out of the previous item.
- Actual: passed on first run, as predicted
- Type: passed unexpectedly (predicted, but not a right-reason failure)
- Resolution: Not vacuous. With the kill-switch call removed, the test fails on `beforeConfirmation` (a command is listed). No rewrite can make it fail without breaking real behavior, so it stays as a pin. `/green` has nothing to implement.

## 2026-11-07 14:50 · `apps/backend/src/app.test.ts::lists no archive command at GET /commands for an archive proposal made while its category was advise, after the category is switched to automatic`
- Behavior: An `archive` proposal made while its category was `advise` yields no command when the category is later switched to `automatic`; it waits for its confirmation
- Predicted: passes on first run — `dea55db` already stamps `madeAutomatic` when the proposal is made and `isCleared` never reads the current mode
- Actual: passed on first run (1 passed, 83 skipped)
- Type: passed unexpectedly
- Resolution: The behavior was delivered as a side effect of the `dea55db` keystone. The test is not vacuous: the code before `dea55db` read the mode at request time and would have listed the command. No variant can fail without driving a different behavior, so the test stays as a pin and the item needs no /green.

## 2026-11-07 14:39 · `apps/backend/src/app.test.ts::lists neither a command at GET /commands nor a task at GET /tasks for a new keep proposal in a category switched to automatic`
- Behavior: In an `automatic` category, a new `keep` proposal yields neither a command nor a task
- Predicted: passes on first run (read before predicting: `GET /commands` filters `action === 'archive'`; `triageEffects` gives a `keep` no tasks)
- Actual: passes on first run
- Type: passed unexpectedly
- Resolution: the behavior already holds from the automatic `archive` / `act` cycles; the test is not vacuous (the same setup with `ccThreadTriage('archive')` lists a command), so it stays as a pin and the item is a tick, not a green.

## 2026-11-07 14:34 · `apps/backend/src/app.test.ts::lists at GET /commands no archive command for a new archive proposal in a category set to advise until it is confirmed`
- Behavior: In an `advise` category, a new `archive` proposal yields no archive command until it is confirmed
- Predicted: passes on first run (read `isCleared` in `app.ts:103` first: only a standing confirmation or a current `automatic` mode yields a command)
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: the behavior was already delivered; the `it.each` row "for an archive proposal that has no verdict yet" (default `advise`) and the confirmed-archive test already pin both halves, and no rewrite can fail without driving a different item, so the duplicate test was removed and nothing was added.

## 2026-11-07 14:22 · `apps/backend/src/app.test.ts::shows at GET /categories no agreement rate for a category with no proposals while another category has some`
- Behavior: `GET /categories` shows no agreement rate for a category with no proposals
- Predicted: passes on first run — `agreementRate` already returns `undefined` for an empty category (`app.ts:127`, added by the previous green), and JSON drops the key
- Actual: passed (1 passed, 77 skipped)
- Type: passed unexpectedly
- Resolution: the behavior shipped with the previous item and is already pinned by `lists at GET /categories every triage category with mode advise when none has been switched` (its `toEqual` fails if an `agreementRate` key appears); no failing test is possible, so the test was removed and the TODO item can be checked off with no code change.

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
