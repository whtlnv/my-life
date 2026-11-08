# TODO.md — working set

## Phase 2 — Every account, categories, Gmail filters

### Every account

- [x] When a message from account A is triaged and `profile/` holds a file named after A's domain (`psmutuus.md` for `franciscoc@psmutuus.com`), that file's text is in the prompt sent through the Claude adapter (backlog: apps/backend/src/claude-triage.ts Triage sends every `profile/*.md` file to Claude, not the account's own)
- [x] When a message from account A is triaged, the profile file named after another account's domain is not in the prompt (backlog: apps/backend/src/claude-triage.ts Triage sends every `profile/*.md` file to Claude, not the account's own)
- [x] When any account's message is triaged, `profile/accounts.md` is in the prompt
- [x] When a message is triaged, `profile/README.md` and any `*.example.md` file are not in the prompt (backlog: apps/backend/src/claude-triage.ts The triage prompt includes `profile/README.md`)
- [x] When a message from an account whose domain has no `profile/<domain>.md` file (the gmail.com account today) is triaged, the call still goes through with `profile/accounts.md` alone in the prompt, instead of failing on the missing file (supervisor keystone: the first green reads `<domain>.md` unconditionally)
- [x] An `action` proposal for a message whose `to` and `cc` do not contain the reporting account's email appears in the `cc-thread` group of `GET /triage-queue`, not in `action` (backlog: packages/domain/src/displayed-category.ts:3 `displayedCategory` is tested but never called)
- [x] An `action` proposal for a message addressed to the reporting account stays in `action` in `GET /triage-queue` (backlog: packages/domain/src/displayed-category.ts:3 `displayedCategory` is tested but never called)
- [x] After a backend restart on the same database, an `action` proposal demoted to `cc-thread` (message not addressed to the account) is still in the `cc-thread` group of `GET /triage-queue` (supervisor keystone: the demotion must survive the proposal store round trip)
- [x] An `action` proposal for a message where the reporting account is only in `cc`, not in `to`, appears in the `cc-thread` group of `GET /triage-queue` (the domain rule `displayedCategory` / `isAddressedToUser` reads `to` only; CLAUDE.md: Cc mail is summarized, not actioned)
- [x] When a confirmed `archive` proposal is re-decided as rejected through `POST /verdicts`, `GET /commands?accountEmail=…` no longer lists its archive command (backlog: packages/domain/src/current-verdict.ts:1 `currentVerdict` is tested but never called)
- [x] When a rejected `archive` proposal is re-decided as confirmed through `POST /verdicts`, `GET /commands?accountEmail=…` lists its archive command (backlog: packages/domain/src/current-verdict.ts:1 `currentVerdict` is tested but never called)
- [x] When a confirmed `act` proposal (with a task draft) is re-decided as rejected through `POST /verdicts`, `GET /tasks` no longer lists its task; the latest verdict by decision time decides every effect, through the domain's `currentVerdict` (supervisor keystone: `GET /commands` reads the last stored verdict by position while tasks and check-later still read the first)
- [x] When the daily spend ceiling was reached yesterday (business time zone) and the process kept running past business midnight, `POST /triage-run` proposes again and `GET /triage-queue` reports `paused: false` (backlog: packages/domain/src/triage-spend.ts:16 `isTriagePaused` is tested but never called)
- [x] When the daily spend ceiling was reached earlier the same business day, `POST /triage-run` still proposes nothing and `GET /triage-queue` reports `paused: true` (backlog: packages/domain/src/triage-spend.ts:16 `isTriagePaused` is tested but never called)
- [x] When a message from a sender with no verdict history is triaged, the examples passed to the Triage port include verdicts on earlier messages from the same sender domain (backlog: Same-category verdict examples cannot be chosen at proposal time)
- [x] When a message is triaged, verdicts on messages from other sender domains (and other List-Ids) are not passed as domain-fallback examples (backlog: Same-category verdict examples cannot be chosen at proposal time)

### Category modes

- [x] `GET /categories` lists every triage category (`action`, `cc-thread`, `expense`, `system-update`, `sales`, `calendar-drive`, `unknown`) with mode `advise` when none has been switched
- [x] After `PUT /categories/:category/mode` with `automatic`, `GET /categories` shows that category `automatic` and every other category still `advise`
- [x] After `PUT /categories/:category/mode` with `advise`, a category previously `automatic` shows `advise` again
- [x] `PUT /categories/:category/mode` with an unknown category or mode answers 400 and changes nothing
- [x] A category's mode survives a backend restart on the same database
- [x] `GET /categories` shows each category's agreement rate as confirmed verdicts ÷ proposals in that category (a rejection or a correction counts as not confirmed)
- [x] `GET /categories` shows no agreement rate for a category with no proposals
- [x] `GET /categories` lists each category's five most recent proposals, newest first, each with its summary, action, account and link
- [x] In an `automatic` category, a new `archive` proposal yields an archive command in `GET /commands?accountEmail=…` with no verdict
- [x] In an `advise` category, a new `archive` proposal yields no archive command until it is confirmed
- [x] In an `automatic` category, a new `act` proposal with a task draft appears in `GET /tasks` with no verdict
- [x] In an `automatic` category, a new `keep` proposal yields neither a command nor a task
- [x] An `archive` proposal made while its category was `automatic` still yields its archive command after the category is switched back to `advise`: the automatic decision is recorded when the proposal is made, as an append-only verdict-like event, not derived from the current mode (supervisor keystone: `GET /commands` reads the current mode at request time)
- [x] In an `automatic` category, an `archive` proposal the user then rejects through `POST /verdicts` yields no archive command: the user's later decision wins over the automatic one (supervisor keystone)
- [x] An `archive` proposal made while its category was `advise` yields no command when the category is later switched to `automatic`; it waits for its confirmation (automatic applies to new proposals only)
- [x] After a backend restart on the same database, an `archive` proposal made while its category was `automatic` still yields its archive command (and an `act` one its task) without a verdict: the automatic decision is persisted with the proposal, not kept in memory (supervisor keystone: `madeAutomatic` is an in-memory flag)
- [x] A proposal acted on automatically no longer appears in `GET /triage-queue` and is not counted in the badge
- [x] An archive command issued automatically carries the label `my-life/auto`; one issued after a confirmation carries `my-life/archived`
- [x] When the extension carries out an archive command labeled `my-life/auto`, the Gmail modify call adds the `my-life/auto` label (created if missing), not `my-life/archived`
- [x] `POST /categories/kill-switch` returns every `automatic` category to `advise`
- [x] After the kill switch, a new `archive` proposal in a category that was `automatic` yields no command until confirmed
- [x] The dashboard app shell has a `Categories` tab linking to `#/categories`, marked current on that route
- [x] The `#/categories` page shows one row per category from `GET /categories` with its agreement rate placed before its `advise` / `automatic` switch
- [x] The `#/categories` page shows "no proposals yet" in place of the rate for a category without proposals
- [x] Flipping a category's switch on `#/categories` sends `PUT /categories/:category/mode` with the new mode and shows the mode the backend returns
- [x] Expanding a category on `#/categories` lists its recent proposals with summary, action, account name and a link to the message
- [x] The kill-switch button on `#/categories` sends `POST /categories/kill-switch` and every switch then reads `advise`

### Filter proposals

- [x] After a third confirmed `archive` from the same sender (in any category), a filter candidate on `from` exists for that sender and account
- [x] After only two confirmed `archive`s from the same sender, no filter candidate exists
- [x] Rejected or corrected archive proposals do not count toward a sender's three
- [x] Confirmed archives are counted per sender: two senders with two confirmed archives each in the same account yield no candidate, and three from one sender plus one from another yield exactly one candidate, on the first sender, listing only its three messages (supervisor triangulation: the green counts every input as one sender)
- [x] Three confirmed archives of messages carrying the same `listId` yield a candidate on the List-Id rather than on the sender
- [x] Confirmed archives from the same sender in two different accounts are counted per account, so two in each yield no candidate
- [x] The confirmed archives counted toward a candidate survive a backend restart on the same database (sender and List-Id of reported messages are persisted)
- [x] The filter-proposal contract accepts criteria (`from`, `subject` or `listId`, at least one), a label name and `skipInbox`
- [x] The filter-proposal contract accepts a proposal whose criteria hold only `from`, and one whose criteria hold only `listId`, with the other criteria absent (supervisor triangulation: the green requires all three)
- [x] The filter-proposal contract rejects a proposal with no criteria
- [x] When a filter candidate appears, the backend asks the filter port once for a proposal and stores it with the account, the candidate's messages, the prompt version and the time; the same candidate is not asked about again
- [x] Only archives count toward a filter candidate: three confirmed `keep` (or `act`) proposals from the same sender yield no candidate, while a rejected proposal corrected to `archive` counts as one (supervisor triangulation: the backend feeds every decided message, whatever its action, to the candidate rule)
- [x] After a backend restart on the same database, a candidate that already has a stored filter proposal is not asked about again; the stored proposals are the memory, not an in-process set (supervisor keystone)
- [x] The Claude filter adapter calls the model from config with a strict `propose_filter` tool built from the filter-proposal contract and a versioned prompt file, and returns the validated proposal
- [x] Each filter-adapter call is logged as spend and counts against the daily ceiling; at the ceiling no filter proposal is asked for
- [x] The filter port is asked with the candidate's account, its criteria (sender or List-Id) and, for each of its messages, the sender and subject, and the Claude filter adapter puts all of that in the user message of its request, so a proposal about sender X is asked with X's archived mail in front of the model (supervisor keystone: the adapter ignores the candidate it is given and sends no messages)
- [x] When the backend asks the filter port about a candidate, the candidate carries, for each of its messages, the sender and the subject as reported, also after a backend restart on the same database (the subject is persisted with the reported message) (supervisor: the previous item delivered the adapter clause only; the backend still passes message ids alone)
- [x] The Claude filter adapter reports each call's cost in USD from the response usage and the configured pricing, the way the triage adapter does, so the backend's spend log for filter calls is real (supervisor keystone: the adapter returns no cost)
- [x] `GET /filter-proposals` lists pending proposals with criteria, label, account and the count of archives behind each
- [x] `POST /filter-proposals/:id/approval` stores the approval with its time, and `GET /commands?accountEmail=…` then lists a `create-filter` command for that account with the criteria and label
- [x] A filter proposal with no stored approval never yields a `create-filter` command
- [x] A `create-filter` command carries an id (`create-filter-<proposal id>`), and once it is acknowledged through `POST /commands/:id/acknowledgement` it is no longer listed by `GET /commands?accountEmail=…` (supervisor keystone: the command has no id, so the extension could never acknowledge it)
- [x] `POST /filter-proposals/:id/rejection` removes the proposal from `GET /filter-proposals`, and the same sender or List-Id is not proposed again
- [x] Filter proposals, approvals and rejections survive a backend restart on the same database
- [x] An approved filter proposal is no longer listed by `GET /filter-proposals` (pending means neither approved nor rejected) (supervisor: no item said what approval does to the pending list)
- [x] The extension manifest requests the `gmail.settings.basic` scope
- [x] The fake Gmail server answers `users.settings.filters` create, list and delete, and the label calls the filter needs
- [x] When the extension receives a `create-filter` command, it creates the label if missing, calls `users.settings.filters.create` with the criteria, `addLabelIds` of that label and `removeLabelIds: ['INBOX']`, and acknowledges with the Gmail filter id
- [x] When `users.settings.filters.create` fails, the extension does not acknowledge the command, and it is offered again on the next poll
- [x] An approved filter proposal in the real backend becomes a filter in the fake Gmail server when the real extension code polls `GET /commands?accountEmail=…` and carries the command out (integration test in `apps/integration`): the command the backend lists (`id`, `type`, `criteria`, `labelName`, `skipInbox`, from the filter-proposal contract) and the command the extension reads are the same shape, and the acknowledgement reaches the backend (supervisor keystone: the extension's own test reads a `label` field the backend never sends)
- [x] `GET /filters` lists filters whose creation was acknowledged, with criteria, label, account and the Gmail filter id; an approved but unacknowledged one is not listed
- [x] `GET /filters` says when each filter was approved and when its creation was acknowledged, from the clock at the time of each event, also after a backend restart (supervisor: approvals and acknowledgements are stored without their time; CLAUDE.md says every append-only event carries a timestamp and every number says when)
- [x] `DELETE /filters/:id` yields a `delete-filter` command for that filter's account only
- [x] When the extension receives a `delete-filter` command it calls `users.settings.filters.delete` with the Gmail filter id and acknowledges (extension clause, cd065d4; the backend clause is the next item)
- [x] After a `delete-filter` command is acknowledged through `POST /commands/:id/acknowledgement`, the filter is gone from `GET /filters` and the command is no longer listed
- [x] A requested deletion survives a backend restart on the same database: the `delete-filter` command is still listed afterwards, and the deletion request carries the time it was made (supervisor keystone: `DELETE /filters/:id` keeps the request in an in-memory array)
- [x] The dashboard app shell has a `Filters` tab linking to `#/filters`, marked current on that route
- [x] The `#/filters` page lists pending proposals; Approve sends `POST /filter-proposals/:id/approval` and Reject sends `POST /filter-proposals/:id/rejection`
- [x] The `#/filters` page lists created filters with account name, criteria and label; Delete sends `DELETE /filters/:id`
- [x] The `#/filters` page shows an empty state when there are neither proposals nor filters

### Weekly expense statement

- [x] The weekly statement holds every `expense` proposal whose message date falls in the requested Monday–Sunday business week (`America/Mexico_City`), with vendor, amount, currency, date and the message link, sorted by date
- [x] An `expense` proposal from outside the requested week is not in that week's statement
- [ ] A proposal of another category (`sales`, `system-update`) dated inside the week is not in the statement, even when its extract carries an amount (supervisor triangulation: the green never reads the category)
- [ ] An `expense` proposal the user rejected is left out of the statement
- [ ] `GET /expense-statement?week=YYYY-MM-DD` answers a CSV file (`text/csv`, `Content-Disposition: attachment`) with header `vendor,amount,currency,date,account,link` and one row per entry, quoting fields that contain commas or quotes
- [ ] `GET /expense-statement` without `week` answers the current business week
- [ ] The dashboard app shell has a `Statement` tab linking to `#/statement`, marked current on that route
- [ ] The `#/statement` page shows the current week's entries in a table with their total per currency, and a Download link to that week's CSV
- [ ] The `#/statement` page's previous / next week controls load and show the other week's entries
- [ ] The `#/statement` page shows an empty state for a week with no expenses

### Wiring and acceptance

- [ ] The backend started by `main.ts` (with an Anthropic key) wires the category-mode store, the Claude filter adapter and the statement route, so a category switched to `automatic` over HTTP issues archive commands and a third confirmed archive yields a stored filter proposal
- [ ] The extension's shipped start-up (`extension-start.ts`) carries out `create-filter` and `delete-filter` commands on every Gmail poll alongside archive commands
- [ ] `scripts/demo.sh` seeds category modes with agreement rates, two filter proposals and one created filter, and a week of expense proposals across two accounts
- [ ] Screenshots of `#/categories`, `#/filters` and `#/statement` over `scripts/demo.sh` go in `docs/screenshots/` and show every page built from the existing tokens and component classes
