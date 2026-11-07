# TDD Prediction Mismatches

Append-only audit log of `/red` prediction mismatches and their resolutions. Newest first. Never edit or delete prior entries — that destroys the audit trail.

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
