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
- [ ] The Slack fake records each `search.messages` query, and the test can read them back
- [ ] In the `thread-reply` scenario, the Slack fake's `search.messages` for `from:<@U0000>` returns the message the user wrote, with its channel and `thread_ts`
- [ ] In the `mention` scenario, the Slack fake's `search.messages` for `from:<@U0000>` returns no matches, while any other query still returns the mention
- [ ] A poll searches Slack for the messages written by the user id that the workspace's `auth.test` names
- [ ] When the Slack fake is started with another own Slack user id, the poll searches for the messages written by that id
- [ ] A poll stores a reply by someone else in a thread the user wrote in, with the thread's channel and the reply's sender, text and timestamp
- [ ] A second poll of the same workspace stores only the thread replies newer than the first poll
- [ ] A poll does not store a reply in a thread the user never wrote in
- [ ] A DM message the user sent is stored as sent by the user
- [ ] A stored Slack message carries its sender's Slack display name
- [ ] A stored Slack message whose sender `users.info` cannot resolve carries the sender's user id as its name
- [ ] When Slack answers 429 with `Retry-After`, the poll waits that long and retries, and the message is stored
- [ ] When one workspace answers `invalid_auth`, the poll does not retry it, and the other workspace's messages are still stored
- [ ] Slack messages stored before a backend restart are served after it
- [ ] The dashboard shows a Slack workspace as stale when its last successful poll is older than twice its polling interval
- [ ] The dashboard shows a Slack workspace as fresh, with its last poll time, when its last successful poll is within twice its polling interval

### Triage

- [ ] A Slack message from someone else appears in `GET /triage-queue` as a Slack item offering `ignore`, `act` and `reply`, with its sender, text, workspace and Slack permalink
- [ ] A Slack message the user sent does not appear in the triage queue
- [ ] Confirming `ignore` on a Slack item removes it from the triage queue and stores the verdict
- [ ] Confirming `act` on a Slack item creates an open task whose source link is the Slack message and whose account is the workspace
- [ ] A Slack item with a stored verdict stays out of the triage queue after a backend restart
- [ ] Confirming `reply` on a Slack item posts nothing to Slack
- [ ] The triage page shows Slack items in their own group, each with its sender, workspace and text
- [ ] On the triage page, the ignore key on a Slack item posts the `ignore` verdict and the act key posts the `act` verdict

### Waiting-on

- [ ] A Slack DM from someone else that the user has not answered later in the same conversation appears in `GET /waiting-on` with channel `slack`, waiting since its timestamp
- [ ] A Slack DM the user answered later in the same conversation does not appear in `GET /waiting-on`
- [ ] A Slack mention the user answered in its thread does not appear in `GET /waiting-on`
- [ ] `GET /waiting-on` orders email and Slack people together by how long they have waited

### People view

- [ ] `GET /people` lists a Slack sender as a contact with a Slack handle (workspace and user id) and channel `slack`
- [ ] A Slack contact's timeline lists their Slack messages newest first, each with its workspace and Slack permalink
- [ ] A VIP-marked Slack contact waiting more than 1 business day on a reply is listed as Urgent
- [ ] A VIP-marked Slack contact waiting less than 1 business day is not listed as Urgent
- [ ] The People page shows a Slack contact with its channel tag and opens the contact's Slack timeline
- [ ] `GET /people` gives a contact's stored organization name where the import or extraction has one (backlog: apps/backend/src/app.ts The People lists show domains, not organization names)
- [ ] `GET /people` gives the sender's domain as the organization when no organization name is stored (backlog: apps/backend/src/app.ts The People lists show domains, not organization names)
- [ ] `GET /people` leaves out a sender whose messages are all automated mail (backlog: apps/backend/src/app.ts The People lists … include automated senders)
- [ ] `GET /people` keeps a sender with at least one message that is not automated mail (backlog: apps/backend/src/app.ts The People lists … include automated senders)
- [ ] A contact merely mentioned in a message with a deadline inside 48 hours is not Urgent for that deadline (backlog: packages/domain/src/contact-urgency.ts:58 Urgency counts deadlines in messages that only mention a contact)
- [ ] A contact who sent a message with a deadline inside 48 hours is Urgent for that deadline (backlog: packages/domain/src/contact-urgency.ts:58 Urgency counts deadlines in messages that only mention a contact)
- [ ] An Urgent contact with both an unanswered ask and a deadline lists both reasons (backlog: packages/domain/src/contact-urgency.ts:58 … stops at the first reason)
- [ ] An Urgent contact with only a deadline lists only the deadline reason (backlog: packages/domain/src/contact-urgency.ts:58 … stops at the first reason)

### Reply

- [ ] An explicit send from the dashboard with a workspace, conversation and text posts the text to `chat.postMessage` with the user's token and records the send
- [ ] A send that names a thread posts the reply into that thread; a send without one posts to the conversation
- [ ] A send Slack rejects returns the Slack error to the dashboard and records no send
- [ ] After a reply is sent, the person no longer appears in `GET /waiting-on` for that conversation
- [ ] Pressing the reply key on a Slack triage item opens a composer; its Send posts the typed text as an explicit send
- [ ] The composer's Send is disabled while the text is empty

### Wiring and acceptance

- [ ] The shipped backend (`main.ts`), started with a workspace token and `MY_LIFE_SLACK_API_URL` pointed at the Slack fake, polls at the configured interval and serves the scenario's DM in `GET /triage-queue`, and its send route posts to the fake's `chat.postMessage`
- [ ] `scripts/demo.sh` seeds Slack DMs, a mention and a thread reply; screenshots of the triage page, the People page with a Slack contact and the reply composer are saved under `docs/screenshots/`
