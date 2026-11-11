# TDD Prediction Mismatches

Append-only audit log of `/red` prediction mismatches and their resolutions. Newest first. Never edit or delete prior entries — that destroys the audit trail.

## 2026-11-11 01:19 · `apps/backend/src/app-chat.test.ts::lists at GET /commands, after a restart, a new send-whatsapp command queued once an earlier one was acknowledged`
- Behavior: An acknowledged `send-whatsapp` command is no longer listed by `GET /commands` (and only that command)
- Predicted: the plain "acknowledged command disappears" test passes on first run, since `GET /commands` already filters every command id through the acknowledgement store
- Actual: passed unexpectedly, as predicted; rewritten around the real gap, it fails with AssertionError: expected [] to contain the new send
- Type: passed unexpectedly
- Resolution: WhatsApp sends live in memory with index ids (`send-whatsapp-0`) while acknowledgements persist in SQLite, so after a restart a new send reuses an acknowledged id and is hidden; the test now drives unique, restart-safe command ids (the WhatsApp profile is re-reported after restart, because `whatsappAccountEmail` is also in-memory).

## 2026-11-11 00:59 · `apps/backend/src/app-chat.test.ts::leaves out of GET /people a WhatsApp message the user sent, so the user is not listed as their own WhatsApp contact`
- Behavior: The user's own WhatsApp messages do not list the user as a WhatsApp contact
- Predicted: passes on first run (not a right-reason failure) — every `/people` group filters chat messages through `isFromSomeoneElse` regardless of channel
- Actual: passed
- Type: passed unexpectedly (by the item; predicted by the reading)
- Resolution: The behavior shipped with the previous item (02ace23): WhatsApp messages share the channel-agnostic `sentByUser` filter on every `/people` list. No failing rewrite exists without testing a different behavior; the test is kept as a guard and the TODO item needs no green step.

## 2026-11-11 00:53 · `apps/backend/src/app-chat.test.ts::lists at GET /people, under Everyone else on channel whatsapp, the sender of a WhatsApp message, and lists that message at GET /whatsapp-contacts/:name/timeline`
- Behavior: A WhatsApp sender appears on the People tab as a contact with their WhatsApp messages in the timeline
- Predicted: AssertionError — `/people` lists Ana with channel `telegram` and `telegramHandles`, since every chat message goes through `telegramSenderAsContact`
- Actual: SyntaxError from `getJson` — the timeline request ran before the `/people` assertion, and the missing `/whatsapp-contacts/:name/timeline` route answers a plain-text 404
- Type: wrong-reason
- Resolution: moved the timeline request after the `/people` assertion; the test now fails with the predicted assertion (channel `telegram`, `telegramHandles: [{ userId: 'Ana' }]`)

## 2026-11-11 00:36 · `apps/backend/src/app-chat.test.ts::keeps at GET /triage-queue a WhatsApp message whose only stored verdict with its chat id and message id is on Telegram, since a verdict hides only its own channel's message`
- Behavior: A WhatsApp message with a stored verdict is no longer in the triage queue
- Predicted: first draft (WhatsApp verdict hides the WhatsApp message) passes vacuously
- Actual: passed on first run, as predicted
- Type: passed unexpectedly
- Resolution: `describeChatItems` already hides any message whose chatId + messageId has a verdict, and WhatsApp messages are stored with the chat title as chatId, so the item's literal behavior existed; rewrote the test to drive what is missing: verdict matching ignores channel, so a Telegram verdict with the same ids hid the WhatsApp message (now fails: `expected [] to deeply equal [ObjectContaining{channel: 'whatsapp', …}]`).

## 2026-11-10 22:52 · `apps/extension/src/whatsapp-page-parser.test.ts::dates each message in the saved group chat on its own day, across the change from one day to the next`
- Behavior: Two messages in the open-chat fixture dated on different days parse to their own dates
- Predicted: passes on first run (behavior already delivered by the `data-pre-plain-text` item, a6ef124, which parses each row's own date)
- Actual: passes on first run (29/9 6:15 pm → 2026-09-29T18:15:00-06:00; 30/9 7:16 pm → 2026-09-30T19:16:00-06:00)
- Type: passed unexpectedly
- Resolution: no missing behavior to drive — the previous item's per-row label parsing already covers cross-day dates (its hand-built test even spans 30/9 → 1/10); kept the fixture-based test as a characterization pin rather than invent a failure. Side finding: the group fixture's `3EB0F00000009AABA1B2C3` and the one-to-one fixture's first two rows have no label and parse to `sentAt: "-00-00T00::00-06:00"`, which is the later placeholder item's concern.

## 2026-11-10 22:41 · `apps/extension/src/whatsapp-page-parser.test.ts::marks as not sent by the user a message whose meta holds only its time and no delivery-status icon`
- Behavior: a message row whose `msg-meta` has no delivery-status icon parses as not sent by the user
- Predicted: passes on first run — the previous item's green (`sentByUser: querySelector('[data-testid="msg-meta"] span[aria-label]') !== null`) already yields false, and its "exactly these ids" assertion already pins the negative case on the group fixture
- Actual: passed (1 passed, 4 skipped)
- Type: passed unexpectedly
- Resolution: the item was delivered as a side effect of the previous item; kept the test as a minimal-row pin of the negative case rather than inventing a new behavior to force a failure — /green has nothing to implement.

## 2026-11-10 20:29 · `apps/backend/src/demo.test.ts::lists at GET /triage-queue a Telegram bot digest from its scripted Telegram session`
- Behavior: the demo backend (demo.ts, as scripts/demo.sh runs it) lists a Telegram bot digest in the triage queue
- Predicted: AssertionError — the demo starts, but its digests hold none on channel `telegram` (its scripted Telegram has no bot chat)
- Actual: Error "the demo backend never answered /health" — the demo hangs in seed() at `POST /slack-poll` and never serves
- Type: right-reason mismatch
- Resolution: `searchPagesUntilCaughtUp` (slack-poll.ts) asks for the next `is:dm` page while every match is newer than the newest stored Slack message (across workspaces); the demo's scripted Slack ignores `page` and answers the same matches on every page, so the second workspace's poll never stops. The demo has been unable to start since the paging item landed; green must make the scripted Slack serve `is:dm` across pages (with `paging`) before the bot digest assertion can be reached. Test kept as is.

## 2026-11-10 19:16 · `apps/backend/src/app-chat.test.ts::writes no Telegram bot digest summary at POST /triage-run once today's spend reaches the daily ceiling, and still returns the digest in GET /triage-queue without summary lines`
- Behavior: The triage run writes no Telegram bot digest summary once the daily spend ceiling is reached
- Predicted: pass (stated before running) — the bot-digest path from b6395cb already goes through `summarizeWithinTheSpendCeiling`, which returns early at the ceiling
- Actual: passed
- Type: passed unexpectedly (for a Red step; matched the stated prediction)
- Resolution: The behavior was delivered as a side effect of b6395cb reusing the shared ceiling-guarded summarizer. A mutation check (removing the guard) makes the test fail with `expected 1 to be +0`, so the test is not vacuous; it is kept as a pin and no rewrite can make it fail without changing production code. `/green` has nothing to implement.

## 2026-11-10 18:42 · `apps/backend/src/telegram-message-mapping.test.ts::stores a message from a chat with a person with the chat not marked as a bot`
- Behavior: A Telegram message from a chat with a person is stored with the chat not marked as a bot
- Predicted: passes on first run — the previous green step sets `chatIsBot` only when `chat.bot` is true, and the store adds it back only when the column is 1
- Actual: passed (1 passed, 11 skipped)
- Type: passed unexpectedly
- Resolution: the behavior shipped with the bot-chat item (`b64bd06`); the first mapping test's exact `toEqual` for Luis already pins it at the mapping level. No failing version exists without contriving one, so the test stays as a store round-trip guard and the item is already delivered.

## 2026-11-10 18:28 · `apps/backend/src/app-slack.test.ts::reports on GET /now no failure reason for a workspace whose failed POST /slack-poll was followed by a successful one`
- Behavior: After a failed poll is followed by a successful one the Slack source chip shows no failure reason
- Predicted: passes on first run (read before writing: `POST /slack-poll` builds a new failure map per request and replaces `slackWorkspacePolls` wholesale)
- Actual: passed on first run
- Type: passed unexpectedly (anticipated; no right-reason failure exists)
- Resolution: The behavior was already delivered by 1067c5f. The test is not vacuous (the second poll's workspace name `PS Mutuus` shows it succeeded), so it stays as a regression pin; nothing for /green to implement.

## 2026-11-10 18:01 · `apps/backend/src/slack-poll.test.ts::logs no failure when every workspace polls successfully`
- Behavior: A successful Slack workspace poll logs no error
- Predicted: passes on first run, since `pollSlackWorkspaces` calls `logPollFailure` only inside its `catch` (shipped by the previous item, ab5de77)
- Actual: passes (1 passed)
- Type: passed unexpectedly
- Resolution: The behavior is the other half of the previous item, and the minimal green for that item already covers it, so no version of the test can fail without asserting something else. The test stays as a guard against logging on success; /green has nothing to implement. Separately, `apps/backend/src/app.ts:770` does not pass `logPollFailure`, so the real backend logs nothing yet. That wiring needs its own item.

## 2026-11-10 17:55 · `apps/backend/src/app-slack.test.ts::lists again at GET /triage-queue a conversation's Slack item, carrying the newer message, when a message arrives after the user confirmed ignore on its newest one`
- Behavior: A Slack message newer than the card's verdict brings the conversation's card back, carrying the newer message
- Predicted: passes on first run (verdicts are keyed per message and `describeSlackItems` takes the newest message per conversation before filtering decided ones); fallback AssertionError with `slackItems` empty
- Actual: passes on first run
- Type: passed unexpectedly
- Resolution: already delivered by 4695991/337eb0a (newest-per-conversation plus per-message verdicts); kept as a regression pin, since it fails if a verdict ever hides the whole conversation, and no production code is needed for this item.

## 2026-11-10 17:34 · `apps/backend/src/app-slack.test.ts::lists at GET /triage-queue one Slack item for each of two conversations with messages from someone else, each carrying its own newest message`
- Behavior: Two Slack conversations with messages from someone else show one triage card each
- Predicted: passes on first run — `newestMessagePerSlackConversation` (apps/backend/src/app.ts:1140) already keys by workspace and conversation id
- Actual: passes on first run
- Type: passed unexpectedly
- Resolution: The previous cycle's per-conversation grouping already delivers this behavior. The test is not vacuous: keying by workspace alone would fail it. It was kept as a pin, not rewritten, because the only way to make it fail would be to assert something the item does not ask for.

## 2026-11-10 17:16 · `apps/backend/src/slack-poll.test.ts::asks users.info once for each of two senders who wrote in one poll`
- Behavior: Messages from two different users in one poll cause one `users.info` call each
- Predicted: passes on first run (`displayNamesByUserId` is a Map keyed by user id, so distinct senders already get one lookup each)
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: The previous cycle (26e1929) already produces this behavior and no honest rewrite can make it fail, so the test was removed rather than left as a vacuous red; the item needs no production change.

## 2026-11-10 04:31 · `apps/backend/src/app-chat.test.ts::leaves out of VIP at GET /people a Telegram contact whose vip mark the user removed through DELETE /telegram-contacts/:userId/marks/vip`
- Behavior: `DELETE /telegram-contacts/:userId/marks/vip` and `DELETE /slack-contacts/:workspaceTeamId/:userId/marks/vip` remove the VIP mark
- Predicted: AssertionError — both DELETE routes 404, so `vip` at GET /people still lists the Telegram and the Slack contact (two entries)
- Actual: AssertionError — `vip` listed only the Telegram contact; the Slack contact was never there
- Type: right-reason mismatch
- Resolution: GET /people's `vip` group only holds email contacts and marked Telegram senders (`app.ts` peopleGroups); a Slack VIP mark shows only through Urgent "VIP waiting", so the Slack half was vacuous — narrowed the test to the Telegram route; the Slack route needs its own test observed through Urgent.

## 2026-11-10 03:58 · `apps/dashboard/src/triage-page.test.tsx::removes a Telegram card from the page once the backend accepts its verdict, and keeps the others`
- Behavior: A Telegram card leaves the queue once its verdict is accepted
- Predicted: AssertionError in waitFor — the ignored card's text stays on the page because ChatCard has no onAccepted
- Actual: findByText('Familia Romero') threw on multiple matches — the fixture used the chat title as the sender name, so the card head rendered it twice
- Type: wrong-reason
- Resolution: gave each fixture chat a distinct sender name; the test now fails on the predicted assertion

## 2026-11-10 01:31 · `apps/backend/src/app-people.test.ts::keeps in GET /people Everyone else a sender with one message proposed in an automated category besides one proposed as an action`
- Behavior: Everyone else keeps a sender with at least one message that is not automated mail
- Predicted: passes on first run — `writesInPerson` already keeps a contact when `reportedMessages.some(...)` finds a non-automated message
- Actual: passed (1 passed, 24 skipped)
- Type: passed unexpectedly (predicted; nothing missing)
- Resolution: The previous cycle (2495836) built this with `.some`, so there is no failing test left to write; the test stays as a pin, because changing `.some` to `.every` would drop Luis (message-2 is in an automated category) and fail it.

## 2026-11-10 01:10 · `apps/backend/src/app-chat.test.ts::orders Telegram, email and Slack people together at GET /waiting-on, the one who has waited longest first`
- Behavior: Waiting-on orders Telegram chats with email and Slack by how long each has waited
- Predicted: passes on first run (commit 566646c already merged Telegram people into the sorted /waiting-on list)
- Actual: passed
- Type: passed unexpectedly
- Resolution: The ordering shipped with the "Waiting-on includes a Telegram chat" item. No failing version of this test exists without changing behavior, so I kept it as a pin for the interleaving; the item has nothing left for /green.

## 2026-11-10 00:58 · `apps/backend/src/app-chat.test.ts::createApp chat messages > leaves out of Urgent at GET /people a Telegram contact marked vip whose message has waited less than 1 business day for a reply`
- Behavior: A VIP Telegram contact waiting less than 1 business day is not listed as Urgent
- Predicted: passes on first run (stated up front): `urgentChatSender` already sends every Telegram message through `contactUrgency`, which applies the `vipWaitingBusinessDays` threshold
- Actual: passed — 1 passed, 17 skipped
- Type: passed unexpectedly
- Resolution: The previous item (7f3b85c) built the threshold through the shared domain check, so the negative case came with it. No rewrite that stays on this behavior can fail. The test stays as a regression pin, mirroring the Slack one, and the item needs no green step.

## 2026-11-09 23:37 · `apps/backend/src/app-chat.test.ts::createApp chat messages > lists at GET /chat-messages, after the backend restarts, a chat send with the time it was sent`
- Behavior: Chat sends are listed with their time after the backend restarts
- Predicted: passes on first run (POST /chat-sends already saves clock.now() as time into the SQLite chat store)
- Actual: passed — 1 passed, 7 skipped
- Type: passed unexpectedly
- Resolution: The behavior is already covered by the `/chat-sends` item and "Chat messages saved before the store is reopened are listed after it is reopened". Any rewrite that fails would drive a different behavior, so I removed the test and wrote no Red test. The TODO item can be checked off as already delivered.

## 2026-11-09 23:03 · `apps/backend/src/telegram-login.test.ts::runTelegramLogin > does not ask for a 2FA password when the account has none`
- Behavior: The login flow does not ask for a 2FA password when the account has none
- Predicted: passes on first run (stated up front): the password prompt is a callback that only asks when called, so the behavior arrived with the previous item
- Actual: passes (1 passed, 2 skipped)
- Type: passed unexpectedly
- Resolution: The "asks for the 2FA password" green step made the prompt lazy, and that already covers this behavior; no test that keeps to the behavior can fail, so the test stays as a regression pin rather than a red. The item needs no green step.

## 2026-11-09 22:33 · `apps/backend/src/startup-settings.test.ts::keeps the Telegram session at MY_LIFE_TELEGRAM_SESSION_PATH when it is set`
- Behavior: The Telegram session path follows `MY_LIFE_TELEGRAM_SESSION_PATH` when it is set
- Predicted: passes on first run (the env value is already read with a `??` fallback in `readTelegramSettings`)
- Actual: passed
- Type: passed unexpectedly
- Resolution: the previous item's green step (ce25dae) already built this behavior. A failing rewrite would have to assert something other than the behavior, so the test stays as a focused pin and the TODO item needs no production code.

## 2026-11-09 21:31 · `apps/backend/src/telegram-message-mapping.test.ts::maps an outgoing text message the user wrote to a chat message sent by the user, still titled after the peer`
- Behavior: An outgoing text message the user wrote maps to a chat message sent by the user
- Predicted: test passes (read the code first: `sentByUser: Boolean(message.out)` is already there), which breaks the Red contract of a failing test
- Actual: test passes
- Type: passed unexpectedly (against the Red contract; the code-read prediction held)
- Resolution: the previous green step (288c04c) wrote `Boolean(message.out)` instead of the minimal `false`, so this item was implemented early; no failing test exists for it without driving a different behavior, so the test is kept as a pin and /green has nothing to add.

## 2026-11-09 21:20 · `apps/backend/src/chat-message-store.test.ts::lists a second verdict on the same chat message beside the first, not in its place`
- Behavior: A second verdict on the same chat message is listed beside the first, not in its place
- Predicted: passes (read before running: `chat_message_verdicts` has no unique key and saves with a plain INSERT ordered by rowid)
- Actual: passes
- Type: passed unexpectedly
- Resolution: The previous item's green step already made verdicts append-only; any rewrite that fails would test some other behavior, so the test stays as a pin on append-only verdicts and the item needs no green code.

## 2026-11-09 21:13 · `apps/backend/src/chat-message-store.test.ts::lists two messages with the same chat id and message id but different channels both`
- Behavior: Two messages with the same chat id and message id but different channels are both listed
- Predicted: pass. Commit 86c1e95 already made `saveMessage` skip a duplicate only when channel, chat id and message id all match
- Actual: pass (1 passed)
- Type: passed unexpectedly
- Resolution: The previous green step already built this behavior, and no rewrite can make the test fail without breaking production code. The test stays as a regression pin on the channel part of the key; there is nothing for `/green` to do for this item.

## 2026-11-09 16:24 · `apps/dashboard/src/triage-page.test.tsx::gives a Slack card Ignore, Task and Reply buttons, each labelled with its key `i`, `t` and `r``
- Behavior: A Slack item on the triage page has Ignore, Task and Reply buttons labelled with their keys `i`, `t` and `r`
- Predicted: AssertionError — the card renders no buttons, so the label/key pairs are `[]`
- Actual: TestingLibraryElementError — `getAllByRole('button')` throws when the card has no buttons, before the assertion runs
- Type: right-reason mismatch
- Resolution: Same missing behavior (no buttons on the card); the getAll* query throws when it finds nothing instead of returning `[]`. The failure is right-reason, so the test stays as written.

## 2026-11-09 16:00 · `apps/backend/src/app-slack.test.ts::leaves out of GET /people the user's own Slack identity, whose sent messages are stored`
- Behavior: `GET /people` does not list the user's own Slack identity among the Slack contacts
- Predicted: AssertionError — `everyoneElse` holds both U0001 (Ana) and U0000 (the user), since every stored Slack message becomes a contact
- Actual: first run PARSE_ERROR — the apostrophe in "user's" closed the single-quoted test name; after switching the name to double quotes, the predicted AssertionError (extra `[{ workspaceTeamId: 'T0001', userId: 'U0000' }]`)
- Type: wrong-reason
- Resolution: test-name quoting typo fixed in the test; the prediction held unchanged once the test parsed.

## 2026-11-09 14:03 · `packages/domain/src/contact-urgency.test.ts::lists only the reason "deadline" when a VIP contact's message carries a deadline inside the next 48 hours but has not yet waited a business day`
- Behavior: An Urgent contact with only a deadline lists only the deadline reason
- Predicted: passes; bab3a1c already makes contactUrgency push each reason on its own, so a deadline-only contact gets ['deadline']
- Actual: passes (1 passed, 11 skipped)
- Type: passed unexpectedly
- Resolution: The behavior was delivered with the "lists both reasons" item, and the existing "deadline" test already covers a deadline-only contact, so no test can fail for this item without changing behavior. Kept the test as a pin for the VIP case that has not waited a business day yet. Nothing for /green to do.

## 2026-11-09 13:57 · `packages/domain/src/contact-urgency.test.ts::is urgent, with the reason "deadline", when the contact sent a message with a deadline inside the next 48 hours, even though another message only mentions them`
- Behavior: A contact who sent a message with a deadline inside 48 hours is Urgent for that deadline
- Predicted: passes (the previous cycle's per-message `onlyMentionsContact` filter already delivers it; the sender case is also driven by the existing "message from the contact carries an extracted deadline" test)
- Actual: passes
- Type: passed unexpectedly
- Resolution: No missing behavior to drive. Kept the test as a pin that the mention filter works per message, not per contact. No production change is needed; `/green` has nothing to do.

## 2026-11-09 13:50 · `apps/backend/src/app-people.test.ts::keeps at GET /people a sender who wrote one message in person besides one carrying a List-Id`
- Behavior: `GET /people` keeps a sender with at least one message that is not automated mail
- Predicted: passes on first run (named before running): the previous item's filter already keeps a contact when `some` of its messages lacks a List-Id
- Actual: passed on first run, as predicted
- Type: passed unexpectedly
- Resolution: the previous green step built this behavior along with its own. Nothing can make a "keeps" test fail against the current code, so I kept the test as the only check on a sender who has both kinds of message. It fails if `.some` becomes `.every`; the existing test can't catch that because each of its senders has just one message.

## 2026-11-09 13:45 · `apps/backend/src/app-people.test.ts::gives a contact at GET /people its sender domain as the organization when POST /contacts-import brought it without an organization`
- Behavior: `GET /people` gives the sender's domain as the organization when no organization name is stored
- Predicted: pass (the `?? senderDomain(email)` fallback at apps/backend/src/app.ts:1734 already exists from the previous item's green, and app-people.test.ts "gives each contact at GET /people ... its organization" already pins `acme.com` / `example.com` with nothing stored)
- Actual: passed
- Type: passed unexpectedly
- Resolution: the previous item's green built the domain fallback with the stored-name lookup, so nothing is left to drive; the test was removed and the TODO item can be checked off against the existing test.

## 2026-11-09 13:32 · `apps/backend/src/app-slack.test.ts::leaves out of Urgent at GET /people a Slack contact marked vip whose DM has waited less than 1 business day for a reply`
- Behavior: a VIP-marked Slack contact waiting less than 1 business day is not listed as Urgent
- Predicted: passes on first run (stated before running): the previous cycle (f77b87d) already sends each Slack message through `contactUrgency`, which applies the 1-business-day VIP threshold
- Actual: passed (1 passed, 13 skipped)
- Type: passed unexpectedly
- Resolution: not vacuous. It pins the lower edge of the threshold, and the sibling test (DM 2 days old, same clock) proves the same setup does come out Urgent. No missing behavior is left to drive, so the test stays as a characterization pin and was not rewritten. The TODO item was delivered as a side effect of the previous item.

## 2026-11-09 13:23 · `apps/backend/src/app-slack.test.ts::lists at GET /slack-contacts/:workspaceTeamId/:userId/timeline the Slack messages of that contact, newest first, each with its workspace and Slack permalink`
- Behavior: A Slack contact's timeline lists their Slack messages newest first, each with its workspace and Slack permalink
- Predicted: AssertionError — the route is missing, so `messages` is undefined instead of the two messages
- Actual: SyntaxError — `getJson` parses Hono's plain-text `404 Not Found` body as JSON
- Type: right-reason mismatch
- Resolution: The route is still what's missing; a missing route surfaces as a JSON parse error through `getJson`, not as an assertion. Kept the test as written.

## 2026-11-09 13:08 · `apps/backend/src/app-slack.test.ts::leaves out of GET /waiting-on a Slack mention the user answered in its thread`
- Behavior: A Slack mention the user answered in its thread does not appear in `GET /waiting-on`
- Predicted: passes on first run (no right-reason failure available): `userRepliedLaterInConversation` already hides any message followed by a later `sentByUser` message in the same `conversationId`, and a thread reply shares its channel's conversation id
- Actual: passed, as predicted
- Type: passed unexpectedly
- Resolution: The behavior already came with the previous DM item, and no test of this behavior can be red against the store, so the test stays as a pin with no green step needed. The real gap is in `slack-poll.ts:120`: thread replies are saved without `ownSlackUserId`, so the user's own polled thread replies are never marked `sentByUser`. That is a separate behavior for a poll-level test.

## 2026-11-09 12:47 · `apps/integration/src/slack-fake-server.test.ts::confirming reply at POST /slack-verdicts on a polled Slack DM posts nothing to Slack`
- Behavior: Confirming `reply` on a Slack item posts nothing to Slack
- Predicted: passes on first run, because no backend code calls `chat.postMessage` and `POST /slack-verdicts` only stores the verdict
- Actual: passes (1 passed)
- Type: passed unexpectedly (predicted vacuous pass: the item is a guardrail the code already satisfies)
- Resolution: kept as a regression pin against the Slack fake's `postedMessages()`, since forcing a failure would invent behavior the item doesn't state; there is nothing for /green to implement, and it goes red only if a future reply path posts without an explicit send.

## 2026-11-09 10:40 · `apps/integration/src/slack-fake-server.test.ts::a poll searches Slack for the messages written by the user id that the workspace's auth.test names`
- Behavior: a poll searches Slack for `from:<@id>`, using the id that `auth.test` returns
- Predicted: AssertionError, recorded search queries `['']` do not contain `from:<@U0000>`
- Actual: SyntaxError: Unexpected end of JSON input (first written against the `thread-reply` scenario)
- Type: wrong-reason
- Resolution: the `thread-reply` scenario serves no `conversations.list` (and `mention` serves no `auth.test`), so the poll crashed on an empty fake response before it searched; the test now uses `direct-message`, which serves every endpoint the poll calls, and it fails as predicted.

## 2026-11-09 09:35 · `apps/integration/src/slack-fake-server.test.ts::in the mention scenario returns one channel message that mentions the user from search.messages`
- Behavior: In the `mention` scenario, the Slack fake's `search.messages` returns one channel message that mentions the user
- Predicted: TypeError in the fake's handler (no response table for `mention`) and the client fetch failing with "fetch failed" / socket hang up
- Actual: the TypeError in the handler as predicted, but the fetch hangs until the 5 s test timeout instead of failing, because `writeHead` has already run and the handler throws before `response.end`, which leaves the socket open
- Type: right-reason mismatch
- Resolution: the cause (missing scenario) is right, so I accepted the failure; an unknown scenario or path in the fake hangs instead of erroring fast

## 2026-11-09 01:53 · `apps/backend/src/app-agent.test.ts::undoing an agent archive sends the message's account a command that returns the message to the inbox and removes the archive label`
- Behavior: undoing an agent archive sends the account an undo command that returns the message to the inbox and removes the archive label
- Predicted: AssertionError at toContainEqual — no `undo-automatic` command for message-1 because `POST /agent/actions/undo` does not exist
- Actual: AssertionError earlier — the archive label read from `GET /commands` before the undo was undefined: no archive command was listed at all
- Type: wrong-reason
- Resolution: `GET /commands` lists an archive command only when the triage proposal's action is `archive`, so `archive_message` on a `keep` proposal yields no command (a possible gap of its own); the test now proposes with `ccThreadTriage('archive')` like the existing archive_message test and fails as predicted

## 2026-11-08 23:31 · `apps/backend/src/app-agent.test.ts::calls the model and returns its reply while today's spend is below the daily spend ceiling`
- Behavior: Below the daily spend ceiling, a message to the agent calls the model
- Predicted: pass on first run (stated before running): the ceiling guard from 079aa75 only short-circuits at or above the ceiling (`isTriagePaused` uses `>=`), and otherwise falls through to `agent.respond()`
- Actual: passed (1 passed, 8 skipped)
- Type: passed unexpectedly
- Resolution: the previous item delivered this behavior as the other branch of its guard; no failing test can drive it, so the test stays as a regression pin against the guard blocking below the ceiling, and the TODO item needs no green step.

## 2026-11-08 19:13 · `apps/backend/src/app-tasks.test.ts::keeps after a backend restart on the same database file a done task out of GET /tasks, a snoozed task hidden until its time with its waiting-on person, and each history unchanged`
- Behavior: after a backend restart on the same database file, a done task stays out of `GET /tasks`, a snoozed one stays hidden until its time, the waiting-on person is kept and the history is unchanged
- Predicted: test passes on first run (no right-reason failure available), because `openTaskEventStore` already persists every task event to SQLite and the task routes derive state from it
- Actual: passed on first run; a mutation check (restarted app on a fresh database) fails with `AssertionError: expected [] to deeply equal [ ObjectContaining{…} ]`, so the test is not vacuous
- Type: passed unexpectedly (predicted pass)
- Resolution: the behavior was delivered by the earlier task-route items, which save every transition to `task_events`; the test is kept as a regression pin rather than rewritten to fail artificially, and no green step is needed

## 2026-11-08 18:47 · `packages/domain/src/task-state.test.ts::brings a task snoozed until a time written with a UTC offset back among the open tasks once that time has passed`
- Behavior: A task snoozed until a time is back among the open tasks once that time has passed
- Predicted: the plain version (Z-formatted `until` earlier than `now`) would fail because the task stays hidden
- Actual: reading `openTasks` showed it would pass; the previous green's `event.until > now` already brings an expired snooze back. A `-06:00` (business time zone) `until` would also pass by accident, because a negative offset always sorts lexically before its UTC equivalent
- Type: passed unexpectedly
- Resolution: rewritten before running to use a `+01:00` `until` that has passed in real time but sorts lexically after `now`. It now fails with an AssertionError (`[]` instead of the task) because `openTasks` compares instants as strings and not as times.

## 2026-11-08 17:28 · `apps/backend/src/app-needs-input.test.ts::still asks the category question of a message whose two triage models disagreed, after a backend restart on the same database file, with no triage call made again`
- Behavior: `GET /needs-input` keeps the disagreement category question across a backend restart on the same database file, with no new triage call
- Predicted: AssertionError — `questions` is `[]` after the restart because the disagreement is not persisted with the proposal
- Actual: test passed on first run
- Type: passed unexpectedly
- Resolution: the proposal store saves the whole proposal JSON, `disagreement` included, and `createApp` spreads it back on reload, so the behavior shipped with the original disagreement commit. A mutation check (stripping `disagreement` on reload in `app.ts`, then reverted) makes the test fail, so it is not vacuous. There is no missing behavior to drive, so the test stays as a restart regression pin and the item needs no /green.

## 2026-11-08 17:24 · `apps/backend/src/app-needs-input.test.ts::asks nothing about a message whose two triage models agreed on its category`
- Behavior: `GET /needs-input` asks nothing about a message whose two models agreed
- Predicted: passes on first run, because ee3e830's route only builds questions from proposals that carry a `disagreement`, and `createEscalatingTriage` stores none when the categories match
- Actual: passed (1 passed, 1 skipped)
- Type: passed unexpectedly (anticipated: TODO item already delivered by the prior cycle's minimum implementation)
- Resolution: Not vacuous. With the escalating triage's agreement check removed for a moment, it fails with `expected [ { kind: 'category', … } ] to deeply equal []`. Kept as a pin; `/green` has nothing to implement for this item.

## 2026-11-08 16:54 · `apps/backend/src/app-contacts.test.ts::leaves out of GET /organizations/:name/timeline the messages of contacts outside that organization`
- Behavior: an organization's timeline leaves out messages from contacts outside it
- Predicted: passes on first run (route already filters by the organization's grouped message ids)
- Actual: passes on first run
- Type: passed unexpectedly
- Resolution: the previous green (9199629) built the exclusion in by filtering on `organizationsByName`'s message ids, so the behavior already exists; kept the test as a pin rather than inventing a contrived failing variant.

## 2026-11-08 16:32 · `apps/backend/src/app-contacts.test.ts::leaves out of GET /contacts/:email/timeline a message another contact sent`
- Behavior: A contact's timeline leaves out messages sent by other contacts
- Predicted: passes on first run — the previous cycle's timeline route already filters reported messages by sender email
- Actual: passed on first run (no red)
- Type: passed unexpectedly (anticipated: TODO item already delivered by the prior cycle's minimum implementation)
- Resolution: Not vacuous. With the sender filter removed for a moment, the test fails with `expected ['message-1','message-2'] to deeply equal ['message-1']`. Kept as a pin for the exclusion, and `/green` has nothing to implement for this item.

## 2026-11-08 16:27 · `apps/backend/src/app-contacts.test.ts::lists at GET /contacts, after a second POST /contacts-import brings another organization for a contact whose imported organization the user replaced through PATCH /contacts/:email, that contact still with the organization the user set`
- Behavior: A later Google Contacts import leaves the organization the user set on a contact unchanged
- Predicted: passes on first run (no right-reason failure available): a66ddba already stores imported details in `imported_contact_details` and `loadAll` layers the user's `contact_details` over them
- Actual: passed (1 passed, 51 skipped)
- Type: passed unexpectedly
- Resolution: The behavior was delivered as a side effect of a66ddba's fix for the sibling TODO item; making the test fail would mean inventing a different behavior, so it stays as a regression pin (import → user edit → import) and the item needs no `/green` work.

## 2026-11-08 16:04 · `apps/backend/src/main.test.ts::lists at GET /people under Urgent a contact whose unanswered ask is 1 business day old when MY_LIFE_UNANSWERED_ASK_BUSINESS_DAYS is 1`
- Behavior: The urgency thresholds the shipped backend gets from its startup settings decide `GET /people`
- Predicted: AssertionError — `urgent` is `[]`, because `GET /people` hard-codes `unansweredAskBusinessDays: 2`
- Actual: TypeError — `businessDaysBetween is not a function` (the test imported it from `@my-life/domain`, whose entry point does not export it)
- Type: wrong-reason
- Resolution: The test now finds "1 business day ago" with a local weekday helper (Intl, America/Mexico_City). It then failed as predicted. A probe that set the hard-coded value to 1 made it pass, and the probe was reverted.

## 2026-11-08 15:23 · `packages/domain/src/contact-urgency.test.ts::is not urgent when a message from the contact carries an extracted deadline more than 48 hours away`
- Behavior: a contact whose message carries an extracted deadline more than 48 hours away is not urgent
- Predicted: passes on first run, because `hasDeadlineSoon` already bounds the window with `date - now <= deadlineHours`
- Actual: passes (1 passed, 4 skipped)
- Type: passed unexpectedly
- Resolution: the previous green step built the upper bound in when it added the `<=` window comparison, so this TODO item has no missing behavior. The test stays as a regression pin on the boundary and was not rewritten, because any failing rewrite would be driving a different behavior (for example, a deadline already in the past) that this item does not cover.

## 2026-11-08 13:25 · `apps/backend/src/app-mail-triage.test.ts::opens a database created before Phase 2c and serves GET /triage-queue with its waiting system-update proposal as a digest and its automatic proposal of today under handled for you`
- Behavior: A database created before Phase 2c opens and serves `GET /triage-queue` with digests and handled for you
- Predicted: passes on first run, because Phase 2c only added new tables (`listed_digests`, `digest_summaries`, `undone_automatic_messages`) through `CREATE TABLE IF NOT EXISTS` and altered no existing table or stored proposal shape
- Actual: passed
- Type: passed unexpectedly
- Resolution: No migration is missing, so a failing test would have to assert wrong behavior. The test hand-builds the pre-2c schema and rows. A mutation check (the `listed_digests` table not created → `SqliteError: no such table: listed_digests`) shows it is not vacuous. It is kept as a keystone pin; /green has nothing to implement.

## 2026-11-08 13:21 · `apps/extension/src/gmail-archive.test.ts::does not acknowledge an undo-automatic command whose Gmail request failed`
- Behavior: The extension acknowledges no undo command whose Gmail request failed
- Predicted: passes on first run — the `!labelResponse.ok` → `continue` guard in `carryOutArchiveCommands` already covers undo, since commit 8f93cde routed undo through the same loop as archive
- Actual: passed
- Type: passed unexpectedly
- Resolution: The behavior arrived with 8f93cde, so no failing test is possible without asserting wrong behavior. A mutation check (guard removed → acknowledgement `undo-automatic-message-7` received) shows the test is not vacuous. It is kept as a characterization pin; /green has nothing to implement.

## 2026-11-08 13:00 · `apps/backend/src/app-commands-categories.test.ts::lists at GET /triage-queue nothing under handled for you for a proposal the user confirmed in advise mode, even after its category is switched to automatic`
- Behavior: `GET /triage-queue` does not list, under handled for you, a proposal the user confirmed in advise mode
- Predicted: right-reason assertion failure was the target, but reading `app.ts` first predicted a pass
- Actual: passed on first run
- Type: passed unexpectedly
- Resolution: the behavior already exists — `describeHandledForYou` keeps only `madeAutomatic === true`, and that flag is fixed when the proposal is made (`app.ts:587`), so confirming in advise and then switching to automatic still leaves it out; no honest rewrite can fail, so the test stays as a guard for this edge and `/green` has nothing to implement.

## 2026-11-08 12:31 · `apps/backend/src/app-mail-triage.test.ts::asks the summary model once per digest with only the item summaries of that digest, and carries on each digest its own summary lines`
- Behavior: Two digests each carry their own summary lines: the summary model is asked once per digest, with only that digest's item summaries (no item of another digest, no expense or cc-thread item)
- Predicted: AssertionError — summarize called once with every non-action-block item, so the request list has length 1, not 2
- Actual: first run a PARSE_ERROR (an apostrophe in "digest's" closed the single-quoted test name); after the fix, the predicted AssertionError (1 request carrying 4 item summaries)
- Type: wrong-reason
- Resolution: reworded the test name to avoid the apostrophe; the re-run fails for the predicted reason, and the 4 items show expense and cc-thread summaries also leak into the one request

## 2026-11-08 12:18 · `apps/backend/src/app-mail-triage.test.ts::confirms after a backend restart on the same database file a digest the dashboard loaded before it, reaching only the proposals it held then and leaving the later one in a fresh digest`
- Behavior: After a backend restart, a confirmed digest stays confirmed and the fresh digest still holds only its later proposals
- Predicted: the literal version (confirm before the restart, read the queue after it) passes, because verdicts, proposals and reported messages are all stored in SQLite
- Actual: it passed vacuously
- Type: passed unexpectedly
- Resolution: what survives a restart is already stored; the real gap is the in-memory `listedDigestMessageIds` map, so the test was rewritten so the dashboard loads the digest before the restart and confirms it after; it now fails with `expected [] to deeply equal ['message-build']` (the confirm answers 404 and records nothing)

## 2026-11-08 12:07 · `apps/backend/src/app-mail-triage.test.ts::no longer lists in GET /triage-queue a digest confirmed at POST /digests/:id/confirmation, nor its items in any group`
- Behavior: Confirming a digest removes its items from `GET /triage-queue`
- Predicted: passes on first run — read before writing: the confirm route (apps/backend/src/app.ts:634) saves a `confirmed` verdict per item, and `describeDigests` builds from `triageQueue(…, verdicts)`, which drops decided proposals
- Actual: passes; with the route's verdict save disabled it fails `expected [ { …(6) } ] to deeply equal []`, so the test is not vacuous
- Type: passed unexpectedly
- Resolution: the behavior landed with the earlier "queues an archive command" item, since the verdict that commands the archive also removes the item from the queue; the test is kept as a pin, and the item needs no green step

## 2026-11-08 12:05 · `apps/backend/src/app-mail-triage.test.ts::keeps in GET /triage-queue, with no archive command at GET /commands, another system-update digest of the same account after a digest is confirmed at POST /digests/:id/confirmation`
- Behavior: Confirming a digest leaves another waiting digest of the same category unconfirmed
- Predicted: passes on first run — read before writing: `POST /digests/:id/confirmation` (apps/backend/src/app.ts:634) already filters digests by `identifyDigest(digest) === digestId`
- Actual: passes; still passes after tightening the command assertion to `['message-github']`, which proves the confirm ran and touched only its own digest
- Type: passed unexpectedly
- Resolution: the behavior was delivered as a side effect of the "queues an archive command for each of its items" cycle (id-scoped filter); no rewrite can make it fail without inventing behavior, so the test stays as a non-vacuous regression pin and `/green` has nothing to implement

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
