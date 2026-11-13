# TODO.md — working set


## Phase 6c — Stabilization

### Ingestion never stalls on one odd item

- [x] A mail report holding a message with no subject is accepted, and the message reaches the triage queue
- [x] A mail report holding a message with no To header is accepted, and the message is stored
- [x] A mail report holding a message with no Date header is accepted, and the message is stored
- [x] A mail report holding a message with no From header is accepted, and the message is stored
- [x] A mail report holding a message with no id is still rejected with a 400 (triangulates the four items above)
  - already covered by `apps/backend/src/app-mail-triage.test.ts` (the refused-report case, migrated in cba0c5d to a message with no id) (supervisor)
- [x] When Gmail returns a message with no Subject header, one Gmail poll posts the batch and returns the new history id
- [x] A calendar event with no title is reported with the title "(No title)" and the snapshot is accepted
- [x] A calendar event with a title is still reported with that title (triangulates the item above)
  - already covered by apps/extension/src/calendar-events-snapshot.test.ts:7 (supervisor)
- [x] When the backend rejects a mail report, the extension logs the account and the status it answered
- [x] When the backend accepts a mail report, the extension logs nothing (triangulates the item above)
- [x] When the backend rejects a calendar snapshot, the extension logs the account and the status it answered
- [x] When the backend accepts a calendar snapshot, the extension logs nothing (triangulates the item above)

### Slack poll errors are named

- [x] A Slack answer `{ ok: false, error: "missing_scope" }` fails that workspace's poll with an error naming `missing_scope`
- [x] A Slack answer `{ ok: false, error: "channel_not_found" }` fails that workspace's poll with an error naming `channel_not_found` (triangulates the item above)
- [x] A failed poll's Slack error name is what the Slack chip and the poll log show for that workspace
- [x] A Slack answer `{ ok: false, error: "ratelimited" }` waits and retries the call, and the poll completes when the retry answers `ok: true`

### A delivered Slack reply answers success

- [x] When `chat.postMessage` succeeds and the `auth.test` that records the send then fails, `POST /slack-sends` answers success
- [x] When `chat.postMessage` itself fails, `POST /slack-sends` still answers an error (triangulates the item above)

### Waiting-on is thread-aware for Slack

- [x] A user reply in thread B of a channel leaves a person waiting in thread A of the same channel on the waiting-on list
- [x] A user reply in thread A clears the person waiting in thread A (triangulates the item above)

### Telegram bot digests confirm what was shown

- [x] Confirming a Telegram bot digest leaves a message that arrived after the digest was loaded undecided
- [x] Confirming a Telegram bot digest marks every message it listed (triangulates the item above)
- [x] Confirming a mail digest reaches only the messages listed when that digest was loaded, even after a later `GET /triage-queue` lists more (backlog: apps/backend/src/app.ts:325 _Handled for you_ lists automatic `keep` proposals — digest listed ids overwritten)

### Triage decisions stick

- [x] After a restart, a message whose Keep was confirmed is not retriaged and gets no new proposal
- [x] After a restart, a reported message with no proposal and no verdict is triaged (triangulates the item above)
  - already covered by existing tests, per the cycle (driver; review at phase end)
- [x] A group confirmation leaves a proposal in that group that was decided individually with its own verdict
- [x] A group confirmation confirms the group's undecided proposals (triangulates the item above)
  - already covered by existing tests, per the cycle (driver; review at phase end)
- [x] Correcting a proposal to Archive queues an archive command for that message
- [x] Correcting a proposal to Keep queues no archive command (triangulates the item above)
- [x] Confirming a second Telegram bot digest in the same chat, after the first was confirmed, marks the second digest's messages (found in cycle 15: a bot digest id is only the chat, so its listed ids stay those of the first digest)
- [x] A triage call that returns no proposal stores no proposal and leaves the message pending for the next triage run
- [x] Two cc-thread proposals from different threads show as two cards in the triage queue
- [x] Two cc-thread proposals from the same thread show as one card (triangulates the item above)
- [x] A message reported twice (by two reports) is sent to triage once
- [x] _Handled for you_ leaves out an automatic `keep` proposal (backlog: apps/backend/src/app.ts:325 _Handled for you_ lists automatic `keep` proposals, where nothing was done)
- [x] _Handled for you_ lists an automatic `archive` proposal (triangulates the item above)
  - already covered: `apps/backend/src/app-commands-categories.test.ts:612`

### Spend stays under the ceiling

- [x] A digest summary call whose output fails validation still logs its cost in the day's spend
- [x] After a digest summary call fails, loading the same unchanged digest again makes no new summary call
- [x] After a digest summary call fails, a digest that has changed is asked for a summary again (triangulates the item above)
- [x] A filter-proposal run stops calling Claude once the day's spend reaches the ceiling partway through the run
- [x] A filter-proposal run under the ceiling asks Claude about every candidate (triangulates the item above)
- [x] A digest whose messages changed before a restart is asked for a new summary after the restart, not shown its old one

### Tasks are one model

- [x] A task confirmed from a mail proposal keeps the same id across two `GET /tasks` reads and a restart
- [x] Marking a task confirmed from a mail proposal Done removes it from `GET /tasks`
- [x] A task confirmed from a mail proposal can be ranked by the prioritization pass and shows in its rank order
- [x] Undoing the confirmation of a mail-proposal task removes that task
- [x] Marking a Slack task Done from the dashboard (an id with slashes) reaches the backend and the task is done
- [x] When the backend refuses Done, the dashboard keeps the task on the page
- [x] When the backend accepts Done, the dashboard removes the task (triangulates the item above)
  - already covered by existing tests, per the cycle (driver; review at phase end)
- [x] `POST /tasks/<id>/done` with a Slack task id URL-encoded as one segment (`slack-T1%2FD1%2F…`) marks that Slack task done (backend side of the item above it)
  - already working; red's test passed on the first run and is kept as a regression guard (driver)
- [x] Setting a second waiting-on person on a task replaces the first
- [x] Snoozing a task a second time replaces the first snooze time
- [x] Confirming the same task proposal twice leaves one task
- [x] A task due at a time written with an offset is overdue only after that instant, whatever offset the clock reads in
- [x] A task due at a time written with an offset is not overdue before that instant (triangulates the item above)
  - already working; red's test passed on the first run and is kept as a regression guard (driver)
- [x] A task with a date-only due time is not overdue before the end of that business day in the business time zone
- [x] A task with a date-only due time is overdue after the end of that business day (triangulates the item above)
  - already working; red's test passed on the first run and is kept as a regression guard (driver)

### People are right

- [x] `GET /people` marks a contact urgent by the deadline window `createApp` is given, not the default 48 hours (backlog: apps/backend/src/app.ts:2181 `GET /people` ignores the urgency time zone, deadline window and VIP wait)
- [x] `GET /people` marks a waiting VIP urgent by the VIP wait `createApp` is given, not the default (backlog: apps/backend/src/app.ts:2181)
- [x] `GET /people` counts business days for urgency in the time zone `createApp` is given (backlog: apps/backend/src/app.ts:2181)
- [x] The backend `main.ts` starts serves `GET /people` with the urgency settings its startup settings read
- [x] A person only mentioned in someone else's email is not marked urgent
- [x] A person who asked the user directly and has waited past the threshold is still marked urgent (triangulates the item above)
  - already covered: the test passes on its first run against the previous green step (driver)
- [x] A person only mentioned in someone else's email is not on the waiting-on list
- [x] A Slack person's waiting-on link opens that contact on the People tab
- [x] A Telegram person's waiting-on link opens that contact on the People tab
- [x] An organization's timeline lists each mail message with its Gmail link
- [x] The People tab opens a contact from a link even when a contact listed before it has no email (found in cycle 4: `people-page.tsx:222` reads `emails` of every contact)
- [x] `GET /waiting-on` names a Telegram sender's Telegram id, so its link opens that contact on the People tab (found in cycle 5: `app.ts:2464` sends no id for chat senders)
- [x] A task made from a Slack item names its workspace as its account, not the team id (backlog: apps/backend/src/app.ts:1234 A task made from a Slack item stores the workspace team id as its `accountEmail`)

### Dashboard edges

- [x] A follow-up message in a new agent conversation continues that conversation instead of starting another
- [x] The expense statement CSV quotes a field containing a line break
- [x] The statement page reads a quoted field containing a line break as one entry with that field intact

### Pollers hold up against the real APIs (Codex audit, 2026-11-13)

- [x] A Slack answer `{ ok: false, error: "internal_error" }` fails that workspace's poll with an error naming `internal_error` instead of a crash on a missing field (the live `reading 'matches'` failure)
- [x] Any Slack answer with `ok: false` and an error name not listed before fails that workspace's poll naming that error (triangulates the item above)
- [x] The Slack poll the backend runs on its schedule waits the `Retry-After` seconds of a 429 answer before retrying
- [x] A Slack call answered 429 or `ratelimited` three times in a row fails that workspace's poll naming `ratelimited`, and the next workspace is still polled
- [x] A Slack DM whose `conversations.history` answers `has_more` with a cursor has every message of the polled window stored, not only the newest page
- [x] A second workspace's DM search reads every result page on its first poll even when the first workspace has a newer stored message
- [x] The Slack mention search reads every result page within the lookback
- [x] A Slack thread reply sent from the dashboard is stored with its thread timestamp, so that thread leaves triage and the waiting-on list
- [x] A Slack mention found by search inside a thread is stored with its thread timestamp, read from its permalink
- [x] When a Telegram send succeeds and the own-account lookup after it fails, `POST /chat-sends` still answers success
- [x] When loading Telegram dialog history fails at start-up, new Telegram messages are still stored
- [x] Two Telegram messages in the same second are ordered by message id, so an answer sent in that second counts as the user's reply
- [ ] A Telegram session that connects but is not authorized shows the Telegram chip as not logged in
- [ ] A message an anonymous admin posts in a Telegram supergroup is stored, named after the group

### Phase 5 walk-through

- [ ] `docs/phase-5-walkthrough.md` lists the live Slack checks for the user, and `PENDING_TASKS.md` gains an entry asking the user to run it
