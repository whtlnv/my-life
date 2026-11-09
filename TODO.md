# TODO.md — working set


## Phase 5 — Slack

Decisions taken while decomposing (the brief is silent on them): a Slack sender is a contact keyed by workspace and Slack user id, with the Slack display name (the scopes have no `users:read.email`, so no merge with email contacts in this phase); a Slack triage item is decided by the user (`ignore` / `act` / `reply`), with no Claude proposal.

### Settings

- [x] When the backend starts with `MY_LIFE_SLACK_WORKSPACE_1_TEAM_ID` and `MY_LIFE_SLACK_WORKSPACE_1_USER_TOKEN` set (and the same for `_2_`), its settings list each workspace with its team id and user token
- [x] When a workspace has a team id but no user token, it is left out of the Slack workspaces in the settings
- [x] With `MY_LIFE_SLACK_POLLING_INTERVAL_SECONDS` unset, the Slack polling interval is 60 s
- [x] With `MY_LIFE_SLACK_POLLING_INTERVAL_SECONDS=30`, the Slack polling interval is 30 s
- [x] With `MY_LIFE_SLACK_API_URL` unset, the Slack API base URL is `https://slack.com/api`
- [x] With `MY_LIFE_SLACK_API_URL` set, the Slack API base URL is that value

### Slack fake server

- [x] In the `direct-message` scenario, the Slack fake lists one DM conversation and returns its message from `conversations.history`
- [x] In the `mention` scenario, the Slack fake's `search.messages` returns one channel message that mentions the user
- [x] In the `thread-reply` scenario, the Slack fake's `conversations.replies` returns a new reply in a thread the user wrote in
- [x] The Slack fake answers `users.info` with the display name of each user in the scenario
- [x] The Slack fake answers a request carrying the scenario's token
- [x] The Slack fake answers `invalid_auth` to a request carrying any other token
- [x] In the `rate-limited` scenario, the Slack fake answers the first request with 429 and a `Retry-After` header, and the next one normally
- [x] A message posted to the Slack fake's `chat.postMessage` can be read back by the test, with its channel, thread and text

### Polling

- [x] A poll of a workspace stores each DM message with its workspace, conversation, sender, text and timestamp
- [x] A second poll of the same workspace stores only the DM messages newer than the first poll
- [x] A poll stores the channel messages that mention the user
- [x] The Slack fake answers `auth.test` with the scenario's own Slack user id
- [x] A Slack fake started with a chosen own Slack user id answers `auth.test` with that id
- [x] The Slack fake records each `search.messages` query, and the test can read them back
- [x] In the `thread-reply` scenario, the Slack fake's `search.messages` for `from:<@U0000>` returns the message the user wrote, with its channel and `thread_ts`
- [x] In the `mention` scenario, the Slack fake's `search.messages` for `from:<@U0000>` returns no matches, while any other query still returns the mention
- [x] A poll searches Slack for the messages written by the user id that the workspace's `auth.test` names
- [x] When the Slack fake is started with another own Slack user id, the poll searches for the messages written by that id
- [x] A poll stores a reply by someone else in a thread the user wrote in, with the thread's channel and the reply's sender, text and timestamp
- [x] A second poll of the same workspace stores only the thread replies newer than the first poll
- [x] A poll does not store a reply in a thread the user never wrote in
- [x] A poll finds mentions by searching Slack for `<@id>` with the user id the workspace's `auth.test` names; the Slack fake answers `search.messages` without a `query` with `ok: false` and `no_query`, as Slack does (keystone: the mention poll sent no query, which real Slack rejects)
- [x] A poll lists DM conversations with `types=im,mpim`; the Slack fake's `conversations.list` returns the DM only when `types` includes `im`, as Slack returns public channels by default (keystone: real Slack would list no DMs)
- [x] A second poll asks `conversations.history` only for messages newer than the newest one stored for that conversation, passing `oldest`; the Slack fake honors `oldest` (keystone: every poll re-read whole conversations)
- [x] A thread reply older than a newer message stored in the same channel outside the thread is still stored: the poll asks `conversations.replies` with `oldest` set from the newest stored message of that thread, not of the channel
- [x] A DM message the user sent is stored as sent by the user
- [x] A stored Slack message carries its sender's Slack display name
- [x] A stored Slack message whose sender `users.info` cannot resolve carries the sender's user id as its name
- [x] When Slack answers 429 with `Retry-After`, the poll waits that long and retries, and the message is stored
- [x] When one workspace answers `invalid_auth`, the poll does not retry it, and the other workspace's messages are still stored
- [x] Slack messages stored before a backend restart are served after it
- [x] `POST /slack-poll` on a backend configured with a Slack workspace whose API URL points at the Slack fake (`direct-message` scenario) stores the scenario's DM, which `GET /slack-messages` then serves
- [x] After a successful `POST /slack-poll`, `GET /now` lists each configured Slack workspace with the time of its last successful poll
- [x] After a `POST /slack-poll` in which a workspace answers `invalid_auth`, `GET /now` gives that workspace no new last successful poll time, while the other workspace's time is recorded
- [x] The dashboard shows a Slack workspace as stale when its last successful poll is older than twice its polling interval
- [x] The dashboard shows a Slack workspace as fresh, with its last poll time, when its last successful poll is within twice its polling interval

### Triage

- [x] A Slack message from someone else appears in `GET /triage-queue` as a Slack item offering `ignore`, `act` and `reply`, with its sender, text, workspace and Slack permalink
- [x] A Slack message the user sent does not appear in the triage queue
- [x] Confirming `ignore` on a Slack item removes it from the triage queue and stores the verdict
- [x] Confirming `act` on a Slack item creates an open task whose source link is the Slack message and whose account is the workspace
- [x] A Slack item with a stored verdict stays out of the triage queue after a backend restart
- [x] Confirming `reply` on a Slack item posts nothing to Slack
- [x] The triage page shows Slack items in their own group, each with its sender, workspace and text
- [x] On the triage page, the ignore key on a Slack item posts the `ignore` verdict and the act key posts the `act` verdict

### Waiting-on

- [x] A Slack DM from someone else that the user has not answered later in the same conversation appears in `GET /waiting-on` with channel `slack`, waiting since its timestamp
- [x] A Slack DM the user answered later in the same conversation does not appear in `GET /waiting-on`
- [x] A Slack mention the user answered in its thread does not appear in `GET /waiting-on`
- [x] A thread reply the user posted, saved by the Slack poller from `conversations.replies`, is stored as sent by the user, so the mention it answers stays out of `GET /waiting-on` (keystone: the poller saved thread replies without the user's own Slack id, so their replies were never theirs)
- [x] `GET /waiting-on` orders email and Slack people together by how long they have waited

### People view

- [x] `GET /people` lists a Slack sender as a contact with a Slack handle (workspace and user id) and channel `slack`
- [x] A Slack contact's timeline lists their Slack messages newest first, each with its workspace and Slack permalink
- [x] A VIP-marked Slack contact waiting more than 1 business day on a reply is listed as Urgent
- [x] A VIP-marked Slack contact waiting less than 1 business day is not listed as Urgent
- [x] The People page shows a Slack contact with its channel tag and opens the contact's Slack timeline
- [x] `GET /people` gives a contact's stored organization name where the import or extraction has one (backlog: apps/backend/src/app.ts The People lists show domains, not organization names)
- [x] `GET /people` gives the sender's domain as the organization when no organization name is stored (already covered by app-people.test.ts; no new test) (backlog: apps/backend/src/app.ts The People lists show domains, not organization names)
- [x] `GET /people` leaves out a sender whose messages are all automated mail (backlog: apps/backend/src/app.ts The People lists … include automated senders)
- [x] `GET /people` keeps a sender with at least one message that is not automated mail (pinned; the previous filter already kept them) (backlog: apps/backend/src/app.ts The People lists … include automated senders)
- [x] A contact merely mentioned in a message with a deadline inside 48 hours is not Urgent for that deadline (backlog: packages/domain/src/contact-urgency.ts:58 Urgency counts deadlines in messages that only mention a contact)
- [x] A contact who sent a message with a deadline inside 48 hours is Urgent for that deadline (backlog: packages/domain/src/contact-urgency.ts:58 Urgency counts deadlines in messages that only mention a contact)
- [x] An Urgent contact with both an unanswered ask and a deadline lists both reasons (backlog: packages/domain/src/contact-urgency.ts:58 … stops at the first reason)
- [x] An Urgent contact with only a deadline lists only the deadline reason (backlog: packages/domain/src/contact-urgency.ts:58 … stops at the first reason)

### Reply

- [x] An explicit send from the dashboard with a workspace, conversation and text posts the text to `chat.postMessage` with the user's token and records the send
- [x] A send that names a thread posts the reply into that thread; a send without one posts to the conversation
- [ ] A send Slack rejects returns the Slack error to the dashboard and records no send
- [ ] After a reply is sent, the person no longer appears in `GET /waiting-on` for that conversation
- [ ] Pressing the reply key on a Slack triage item opens a composer; its Send posts the typed text as an explicit send
- [ ] The composer's Send is disabled while the text is empty

### Wiring and acceptance

- [ ] The shipped backend (`main.ts`), started with a workspace token and `MY_LIFE_SLACK_API_URL` pointed at the Slack fake, polls at the configured interval and serves the scenario's DM in `GET /triage-queue`, and its send route posts to the fake's `chat.postMessage`
- [ ] `scripts/demo.sh` seeds Slack DMs, a mention and a thread reply; screenshots of the triage page, the People page with a Slack contact and the reply composer are saved under `docs/screenshots/`
