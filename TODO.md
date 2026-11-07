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
- [ ] `action` and `unknown` proposals come before every group
- [ ] A larger group comes before a smaller one
- [ ] Messages reported but not yet proposed on are counted as remaining, newest first in the order they will be triaged
- [ ] Spend logged today in America/Mexico_City at or above the daily ceiling pauses triage
- [ ] Spend logged today below the daily ceiling does not pause triage
- [ ] Spend logged before midnight in America/Mexico_City does not count toward today's ceiling
- [ ] The examples for a new message are the most recent verdicts from the same sender
- [ ] When there are fewer than N same-sender verdicts, the examples are filled with the most recent verdicts of the same category
- [ ] Verdicts from another sender in another category are never examples
- [ ] At most N examples are chosen
- [ ] The badge count adds the `action` proposals waiting
- [ ] An `action` proposal that has a verdict does not add to the badge count
- [ ] A waiting proposal of another category does not add to the badge count

### Settings (backlog: § Config gaps — Gmail needs its own interval)

- [ ] The Gmail polling interval defaults to 60 seconds and the Gmail source turns stale after twice that without a report (backlog: apps/backend/src/app.ts Config gaps)
- [ ] A Gmail polling interval set in the environment replaces the 60-second default (backlog: apps/backend/src/app.ts Config gaps)
- [ ] The triage model defaults to `claude-opus-5-5`
- [ ] A triage model set in the environment replaces the default
- [ ] The daily spend ceiling defaults to USD 20
- [ ] A daily spend ceiling set in the environment replaces the default
- [ ] The backend refuses to start triage and says why when the Anthropic key is missing

### Extension — Gmail poll

- [ ] On its first poll with no stored history id, the extension reports every inbox message, newest first, with the current history id
- [ ] Inbox listing follows every page until the last
- [ ] With a stored history id, the extension reports only the messages added since that id
- [ ] When the history read answers 404, the extension falls back to a full inbox report
- [ ] Each reported message carries its From, To, Cc, Subject, Date and List-Id headers and its snippet, read in batches of metadata
- [ ] A Gmail read answering 429 or 5xx is retried with backoff
- [ ] A Gmail read answering 403 is not retried
- [ ] The report is posted to the backend with the profile's account email
- [ ] After a report the backend accepts, the next poll starts from the reported history id
- [ ] After a report the backend refuses, the next poll starts from the previous history id
- [ ] The extension polls Gmail every 60 seconds
- [ ] A pending archive command for the profile's account removes the message from the inbox and adds the label `my-life/archived`
- [ ] When the label `my-life/archived` does not exist yet, it is created before the first archive
- [ ] When the label already exists, no second label is created
- [ ] An archive the extension carried out is acknowledged to the backend and is not carried out again
- [ ] An archive that Gmail refused is not acknowledged and is retried on the next poll

### Backend — mail, triage, verdicts

- [ ] A mail report from an allow-listed account is accepted and its messages become reported
- [ ] A mail report from an account outside the allow-list is refused and none of its messages are reported
- [ ] A mail report that fails the shared contract is refused with a client error
- [ ] A message reported twice is stored once
- [ ] Each mail report is stored with the time it was received, and the account's mail source shows when it last reported
- [ ] A triage run asks for a proposal on each reported message that has none, newest first
- [ ] A message that already has a proposal is not sent to triage again
- [ ] A triage run stops asking once today's spend reaches the ceiling
- [ ] Every proposal is stored append-only with the time it was made and the prompt version that made it
- [ ] Every triage call's spend is logged with its time, model and cost
- [ ] The triage queue answers the action block, the groups with their counts, the number of messages remaining and whether the ceiling paused triage
- [ ] Each queue item says which account it came from and links to the message in Gmail for that account
- [ ] A verdict posted for a waiting proposal is stored append-only and the item leaves the queue
- [ ] A verdict posted for an unknown message is refused as not found
- [ ] A rejection carrying a correction stores the correction with the verdict
- [ ] Confirming a whole group stores one confirm verdict for every item in that group and none outside it
- [ ] A confirmed archive queues an archive command for the message's account
- [ ] The commands for one account do not include another account's commands
- [ ] An acknowledged command is no longer pending
- [ ] A confirmed `act` stores a task, and the task list shows its title, source link and account
- [ ] A confirmed `keep` on a `sales` proposal appears on the check-later list
- [ ] GET /now's badge count includes the `action` proposals waiting

### Claude adapter

- [ ] A triage request uses the model id from settings
- [ ] A triage request carries the prompt read from the versioned prompt file and reports that file's version
- [ ] A triage request carries the account's profile text from `profile/`
- [ ] A triage request carries the message's headers, snippet and whether it is addressed to the user
- [ ] A triage request carries the chosen verdict examples
- [ ] A valid tool-use answer becomes a proposal
- [ ] A tool-use answer that fails the shared contract becomes no proposal and the failure is recorded
- [ ] The cost of a call is computed from the tokens the answer reports
- [ ] A scripted fake triage answers the proposals it was scripted with, in order, and costs what it was scripted to cost

### Dashboard — triage page

- [ ] The triage page shows the `action` block first, one card per item with who asks, what is asked and by when
- [ ] An `unknown` item is shown in the `action` block
- [ ] An `action` card with no due time says it has none
- [ ] Every item shows its reason, its account and a link to the message
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

- [ ] The shipped backend reads the Anthropic key from `.env`, triages reported mail with the Claude adapter on a schedule and serves the triage queue
- [ ] The shipped extension polls Gmail every 60 seconds and carries out pending archive commands
- [ ] The shipped dashboard links to the triage page and the page runs against the shipped backend
- [ ] Screenshot of the triage page over the real `franciscoc@psmutuus.com` inbox, with the action block, the groups and the remaining count
