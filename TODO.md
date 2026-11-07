# TODO.md — working set

## Phase 1 — Gmail triage, psmutuus, advise

### Contracts

- [x] A mail report carrying the account email, the mailbox history id and messages with id, thread id, From, To, Cc, Subject, Date, snippet and optional List-Id passes the shared contract
- [x] A mail report whose message has no id fails the shared contract
- [x] A mail report whose message has no Cc header passes the shared contract
- [x] A mail report whose message has no List-Id header passes the shared contract
- [x] A triage proposal with action `archive`, category `cc-thread`, a one-line summary, the category's extract and a reason passes the shared contract
- [x] A triage proposal whose category is not one of the seven categories fails the shared contract
- [x] A triage proposal whose action is not `archive`, `keep` or `act` fails the shared contract
- [x] An `act` proposal carrying a task draft with a title passes the shared contract
- [x] An `action` proposal whose extract names who asks and what is asked, with no due time, passes the shared contract
- [x] An `action` proposal whose extract does not say what is asked fails the shared contract
- [x] An `action` proposal whose extract is a `cc-thread` extract (what happened since the last message, no ask) fails the shared contract
- [x] A `cc-thread` proposal whose extract is an `action` extract (asker and ask) fails the shared contract
- [x] An `expense` proposal whose extract has vendor, amount, currency and date passes the shared contract
- [x] An `expense` proposal whose extract has no amount fails the shared contract
- [x] A `system-update` proposal whose extract has the sending system, a severity and a `significant` flag passes the shared contract
- [x] A `system-update` proposal whose extract has no sending system fails the shared contract
- [x] A `sales` proposal whose extract has company, solution and the problem it solves passes the shared contract
- [x] A `sales` proposal whose extract has no company fails the shared contract
- [x] A `calendar-drive` proposal whose extract names the event or document and what changed passes the shared contract
- [x] A `calendar-drive` proposal whose extract does not say what changed fails the shared contract
- [x] An `unknown` proposal whose extract is empty passes the shared contract
- [x] A `cc-thread` proposal whose extract says what happened since the user's last message passes the shared contract

### Domain

- [x] A message whose To lists the account's address is addressed to the user
- [x] A message that lists the account's address only in Cc is not addressed to the user
- [x] A To entry with a display name and different letter case (`Francisco <FranciscoC@psmutuus.com>`) still counts as addressed to the user
- [x] An `action` proposal on a message addressed to the user stays `action`
- [x] An `action` proposal on a message where the user is only in Cc is shown as `cc-thread`
- [x] A `sales` proposal keeps its category whether the message is addressed to the user or only copies them
- [x] An `archive` proposal with no verdict produces no archive
- [x] An `archive` proposal confirmed by the user produces an archive of that message on its account
- [x] An `archive` proposal rejected by the user produces no archive
- [x] A `keep` proposal confirmed by the user produces no archive
- [x] A rejected proposal corrected to `act` produces a task from the correction instead
- [x] A confirmed `act` proposal produces a task with the draft's title, a link to the message and the account it came from
- [x] A rejected `keep` proposal corrected to `archive` produces an archive and no task
- [x] An `act` proposal rejected without a correction produces no task and no archive
- [x] A confirmed `keep` on a `sales` proposal puts the company on the check-later list
- [x] A confirmed `keep` on a proposal of any other category puts nothing on the check-later list
- [x] A rejected `keep` on a `sales` proposal puts nothing on the check-later list
- [x] A confirmed `archive` on a `sales` proposal puts nothing on the check-later list
- [x] When a message has two verdicts, the later one decides its current state
- [x] When the later verdict is listed before the earlier one, the later one still decides the message's current state
- [x] A message with a proposal and no verdict is waiting in the triage queue
- [x] A message with a verdict is no longer waiting in the triage queue
- [x] Waiting proposals are grouped by category
- [x] Waiting `system-update` proposals are grouped within their category by sending system
- [x] Two waiting `cc-thread` proposals from the same thread show as one line, the newest one
- [x] Two waiting `cc-thread` proposals from different threads show as two lines
- [x] When the newer `cc-thread` proposal of a thread is listed before the older one, the newer one is still the line shown
- [x] `action` and `unknown` proposals come before every group
- [x] A larger group comes before a smaller one
- [x] Messages reported but not yet proposed on are counted as remaining, newest first in the order they will be triaged
- [x] Spend logged today in America/Mexico_City at or above the daily ceiling pauses triage
- [x] Spend logged today below the daily ceiling does not pause triage
- [x] Spend logged before midnight in America/Mexico_City does not count toward today's ceiling
- [x] The examples for a new message are the most recent verdicts from the same sender
- [x] When there are fewer than N same-sender verdicts, the examples are filled with the most recent verdicts of the same category
- [x] Verdicts from another sender in another category are never examples
- [x] At most N examples are chosen
- [x] The badge count adds the `action` proposals waiting
- [x] An `action` proposal that has a verdict does not add to the badge count
- [x] A waiting proposal of another category does not add to the badge count

### Settings (backlog: § Config gaps — Gmail needs its own interval)

- [x] The Gmail polling interval defaults to 60 seconds (backlog: apps/backend/src/app.ts Config gaps)
- [x] An account's mail source that last reported 100 seconds ago is fresh, and one that last reported 130 seconds ago is stale, while its calendar source keeps its own 5-minute rule (backlog: apps/backend/src/app.ts Config gaps)
- [x] A Gmail polling interval set in the environment replaces the 60-second default (backlog: apps/backend/src/app.ts Config gaps)
- [x] The triage model defaults to `claude-opus-5-5`
- [x] A triage model set in the environment replaces the default
- [x] The daily spend ceiling defaults to USD 20
- [x] A daily spend ceiling set in the environment replaces the default
- [x] The backend refuses to start triage and says why when the Anthropic key is missing

### Extension — Gmail poll

- [x] With the Anthropic key set in the environment, the backend's settings say triage is enabled and give no reason
- [x] On its first poll with no stored history id, the extension reports every inbox message, newest first, with the current history id
- [x] Inbox listing follows every page until the last
- [x] With a stored history id, the extension reports only the messages added since that id
- [x] When the history read answers 404, the extension falls back to a full inbox report
- [x] Each reported message carries its From, To, Cc, Subject, Date and List-Id headers and its snippet, read in batches of metadata
- [x] A Gmail read answering 429 or 5xx is retried with backoff
- [x] A Gmail read answering 403 is not retried
- [x] A Gmail read that keeps answering 5xx gives up after 5 tries and the poll fails instead of retrying forever
- [x] Message metadata is read up to 10 messages at a time in parallel, never more than 10 in flight, instead of one after another
- [x] When Gmail is unreachable at startup, the extension still starts and the calendar snapshot is still posted; the Gmail failure is reported to the console, not thrown
- [x] The report is posted to the backend with the profile's account email
- [x] After a report the backend accepts, the next poll starts from the reported history id
- [x] After a report the backend refuses, the next poll starts from the previous history id
- [x] The extension polls Gmail every 60 seconds
- [x] A history response with no `history` field (nothing changed since the stored id) reports zero messages and the current history id
- [x] The second scheduled Gmail poll starts from the history id the first poll reported, not from an empty inbox read
- [x] A scheduled Gmail poll that fails is reported to the console and the next scheduled poll still runs
- [x] A pending archive command for the profile's account removes the message from the inbox and adds the label `my-life/archived`
- [x] When the label `my-life/archived` does not exist yet, it is created before the first archive
- [x] When the label already exists, no second label is created
- [x] An archive the extension carried out is acknowledged to the backend and is not carried out again
- [x] An archive that Gmail refused is not acknowledged and is retried on the next poll

### Backend — mail, triage, verdicts

- [x] A mail report posted to `POST /mail-report` (the path the extension already calls) from an allow-listed account is accepted and its messages become reported
- [x] A mail report from an account outside the allow-list is refused and none of its messages are reported
- [x] A mail report that fails the shared contract is refused with a client error
- [x] A message reported twice is stored once
- [x] A message reported before the backend restarts (a second app opened on the same database file) is still reported after it, and is not counted twice when reported again
- [x] Each mail report is stored with the time it was received, and the account's mail source shows when it last reported
- [x] The mail source's staleness in `GET /now` uses the Gmail polling interval the app was created with: with a 30-second interval, a report received 70 seconds ago is stale
- [x] An account's last mail-report time survives a backend restart (same database file)
- [x] A triage run asks for a proposal on each reported message that has none, newest first
- [x] A message that already has a proposal is not sent to triage again
- [x] A triage run stops asking once today's spend reaches the ceiling
- [x] Every proposal is stored append-only with the time it was made and the prompt version that made it
- [x] Every triage call's spend is logged with its time, model and cost
- [x] Proposals made and spend logged before the backend restarts (same database file) still exist after it: the message is not triaged again and the spend still counts toward today's ceiling
- [x] Spend logged yesterday in America/Mexico_City and reloaded after a backend restart does not count toward today's ceiling, while today's reloaded spend does
- [x] The triage queue answers the action block, the groups with their counts, the number of messages remaining and whether the ceiling paused triage
- [x] Each queue item says which account it came from and links to the message in Gmail for that account
- [x] After a backend restart (same database file), a reloaded proposal keeps its account email, action, category, summary and extract in the queue
- [x] A proposal made in the current run (no restart) shows its action, summary and extract in the queue, the same fields a reloaded proposal shows
- [x] A verdict posted for a waiting proposal is stored append-only and the item leaves the queue
- [x] A verdict posted for an unknown message is refused as not found
- [x] A rejection carrying a correction stores the correction with the verdict
- [x] A verdict posted before the backend restarts (same database file) still keeps its item out of the queue after it
- [x] Confirming a whole group stores one confirm verdict for every item in that group and none outside it
- [x] A confirmed archive queues an archive command for the message's account, listed by `GET /commands?accountEmail=…` (the path the extension already calls) with an `id` and `messageId` per command
- [x] The commands for one account do not include another account's commands
- [x] A confirmed `keep` queues no archive command
- [x] Two confirmed archives on one account list two commands with distinct ids, each carrying its own message id
- [x] A command acknowledged through `POST /commands/:id/acknowledgement` (the path the extension already calls) is no longer pending
- [x] An acknowledgement survives a backend restart (same database file): the command stays out of the pending list
- [x] A confirmed `act` stores a task, and the task list shows its title, source link and account
- [x] A confirmed `keep` on a `sales` proposal appears on the check-later list
- [x] GET /now's badge count includes the `action` proposals waiting

### Claude adapter

- [x] A triage request uses the model id from settings
- [x] A triage request carries the prompt read from the versioned prompt file and reports that file's version
- [x] A triage request carries the account's profile text from `profile/`
- [x] A triage request carries the message's headers, snippet and whether it is addressed to the user
- [x] A triage request for a message where the account is only in Cc says it is not addressed to the user, using the domain's address check
- [x] A triage request carries the chosen verdict examples
- [x] A valid tool-use answer becomes a proposal
- [x] A tool-use answer that fails the shared contract becomes no proposal and the failure is recorded
- [x] A triage request declares exactly one tool, `propose_triage`, whose input schema is the shared triage-proposal contract converted to JSON Schema, marked `strict`, with `tool_choice` left as `auto` (forced tool choice is rejected by the model); the instruction to call it lives in the versioned prompt file, not in code
- [x] The cost of a call is computed from the tokens the answer reports
- [x] A valid tool-use answer, with a prompt file set, also reports its cost from the answer's input and output tokens at their separate prices
- [x] With a prompt file set, an answer that fails the shared contract becomes no proposal with the failure recorded and its cost reported, exactly as without a prompt file (one code path, not two)
- [x] A scripted fake triage answers the proposals it was scripted with, in order, and costs what it was scripted to cost

### Dashboard — triage page

- [x] The triage page shows the `action` block first, one card per item with who asks, what is asked and by when
- [x] An `action` proposal whose extract carries an optional `due` time (ISO 8601) passes the shared contract, and one without it still passes, so the card's "by when" has a real field
- [x] An `unknown` item is shown in the `action` block
- [x] `GET /triage-queue`'s action block includes `unknown` proposals next to `action` ones, and no `unknown` group exists
- [x] `GET /triage-queue`'s groups carry their items (message id, category, summary, extract, reason, account, Gmail link), and a `system-update` group carries its sending-system sub-groups with their items
- [x] An `action` card with no due time says it has none
- [x] Every item shows its reason, its account and a link to the message
- [ ] Each category group shows collapsed with its count
- [ ] Expanding a group lists its items
- [ ] A `system-update` group lists its items under their sending system, and a `significant` item is flagged
- [ ] An `expense` item shows vendor, amount, currency and date
- [ ] A `sales` item shows company, solution and what it solves
- [ ] Pressing `t` on a focused card confirms it as a task
- [ ] Pressing `k` on a focused card keeps it
- [ ] Pressing `a` on a focused card archives it
- [ ] Pressing `r` on a focused card asks for a correction and rejects with it
- [ ] Moving focus with the keyboard changes which card a key acts on
- [ ] The confirm-all key on a focused group confirms that group only
- [ ] An item disappears from the page once its verdict is accepted
- [ ] The page shows how many messages remain to be triaged
- [ ] When the ceiling paused triage, the page says so
- [ ] When triage is not paused, the page shows no paused notice
- [ ] The triage page says when the queue was fetched
- [ ] An all-day event under _Later today_ reads _all day_ instead of a clock time (backlog: apps/dashboard/src/dashboard-app.tsx All-day events show a clock time)
- [ ] A timed event under _Later today_ still shows its start time (backlog: apps/dashboard/src/dashboard-app.tsx All-day events show a clock time)

### Gmail fake server and integration

- [ ] Against the fake Gmail server's `action-to-me` scenario, the message reaches the action block addressed to the user
- [ ] Against the `cc-thread` scenario, the thread shows as one line in its group
- [ ] Against the `expense` scenario, the receipt shows in the expense group with its amount
- [ ] Against the `system-update-burst` scenario, the notifications show grouped by sending system
- [ ] Against the `sales-pitch` scenario, the pitch shows in the sales group
- [ ] Against the `calendar-notification` scenario, the notification shows in the calendar-drive group
- [ ] Against the `history-404` scenario, the extension recovers with a full inbox report
- [ ] Against the fake Gmail server, a confirmed archive leaves the message out of the inbox with the label `my-life/archived`

### Wiring and acceptance

- [ ] (hand-written) `apps/backend/prompts/triage-v1.md` exists: it names the seven categories with the extract each one carries, the addressed-to-the-user rule, the advise-first stance, and asks for the tool call the contract validates; the shipped backend reads it
- [ ] The shipped backend reads the Anthropic key from `.env`, triages reported mail with the Claude adapter on a schedule and serves the triage queue
- [ ] The shipped extension polls Gmail every 60 seconds and carries out pending archive commands
- [ ] The shipped dashboard links to the triage page and the page runs against the shipped backend
- [ ] Screenshot of the triage page over the real `franciscoc@psmutuus.com` inbox, with the action block, the groups and the remaining count
