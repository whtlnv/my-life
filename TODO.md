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
- [ ] An archive command issued automatically carries the label `my-life/auto`; one issued after a confirmation carries `my-life/archived`
  - predicted-contradiction: `apps/backend/src/app.test.ts::lists at GET /commands for the message's account an archive command with an id and the message id once its archive proposal is confirmed` — asserts: a confirmed archive's command is exactly `{ id, messageId }` (`toEqual`, no label field) — retired-by: "one issued after a confirmation carries `my-life/archived`"
- [ ] When the extension carries out an archive command labeled `my-life/auto`, the Gmail modify call adds the `my-life/auto` label (created if missing), not `my-life/archived`
- [ ] `POST /categories/kill-switch` returns every `automatic` category to `advise`
- [ ] After the kill switch, a new `archive` proposal in a category that was `automatic` yields no command until confirmed
- [ ] The dashboard app shell has a `Categories` tab linking to `#/categories`, marked current on that route
- [ ] The `#/categories` page shows one row per category from `GET /categories` with its agreement rate placed before its `advise` / `automatic` switch
- [ ] The `#/categories` page shows "no proposals yet" in place of the rate for a category without proposals
- [ ] Flipping a category's switch on `#/categories` sends `PUT /categories/:category/mode` with the new mode and shows the mode the backend returns
- [ ] Expanding a category on `#/categories` lists its recent proposals with summary, action, account name and a link to the message
- [ ] The kill-switch button on `#/categories` sends `POST /categories/kill-switch` and every switch then reads `advise`

### Filter proposals

- [ ] After a third confirmed `archive` from the same sender (in any category), a filter candidate on `from` exists for that sender and account
- [ ] After only two confirmed `archive`s from the same sender, no filter candidate exists
- [ ] Rejected or corrected archive proposals do not count toward a sender's three
- [ ] Three confirmed archives of messages carrying the same `listId` yield a candidate on the List-Id rather than on the sender
- [ ] Confirmed archives from the same sender in two different accounts are counted per account, so two in each yield no candidate
- [ ] The confirmed archives counted toward a candidate survive a backend restart on the same database (sender and List-Id of reported messages are persisted)
- [ ] The filter-proposal contract accepts criteria (`from`, `subject` or `listId`, at least one), a label name and `skipInbox`
- [ ] The filter-proposal contract rejects a proposal with no criteria
- [ ] When a filter candidate appears, the backend asks the filter port once for a proposal and stores it with the account, the candidate's messages, the prompt version and the time; the same candidate is not asked about again
- [ ] The Claude filter adapter calls the model from config with a strict `propose_filter` tool built from the filter-proposal contract and a versioned prompt file, and returns the validated proposal
- [ ] Each filter-adapter call is logged as spend and counts against the daily ceiling; at the ceiling no filter proposal is asked for
- [ ] `GET /filter-proposals` lists pending proposals with criteria, label, account and the count of archives behind each
- [ ] `POST /filter-proposals/:id/approval` stores the approval with its time, and `GET /commands?accountEmail=…` then lists a `create-filter` command for that account with the criteria and label
- [ ] A filter proposal with no stored approval never yields a `create-filter` command
- [ ] `POST /filter-proposals/:id/rejection` removes the proposal from `GET /filter-proposals`, and the same sender or List-Id is not proposed again
- [ ] Filter proposals, approvals and rejections survive a backend restart on the same database
- [ ] The extension manifest requests the `gmail.settings.basic` scope
- [ ] The fake Gmail server answers `users.settings.filters` create, list and delete, and the label calls the filter needs
- [ ] When the extension receives a `create-filter` command, it creates the label if missing, calls `users.settings.filters.create` with the criteria, `addLabelIds` of that label and `removeLabelIds: ['INBOX']`, and acknowledges with the Gmail filter id
- [ ] When `users.settings.filters.create` fails, the extension does not acknowledge the command, and it is offered again on the next poll
- [ ] `GET /filters` lists filters whose creation was acknowledged, with criteria, label, account and the Gmail filter id; an approved but unacknowledged one is not listed
- [ ] `DELETE /filters/:id` yields a `delete-filter` command for that filter's account only
- [ ] When the extension receives a `delete-filter` command it calls `users.settings.filters.delete` with the Gmail filter id and acknowledges; after the acknowledgement the filter is gone from `GET /filters`
- [ ] The dashboard app shell has a `Filters` tab linking to `#/filters`, marked current on that route
- [ ] The `#/filters` page lists pending proposals; Approve sends `POST /filter-proposals/:id/approval` and Reject sends `POST /filter-proposals/:id/rejection`
- [ ] The `#/filters` page lists created filters with account name, criteria and label; Delete sends `DELETE /filters/:id`
- [ ] The `#/filters` page shows an empty state when there are neither proposals nor filters

### Weekly expense statement

- [ ] The weekly statement holds every `expense` proposal whose message date falls in the requested Monday–Sunday business week (`America/Mexico_City`), with vendor, amount, currency, date and the message link, sorted by date
- [ ] An `expense` proposal from outside the requested week is not in that week's statement
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
