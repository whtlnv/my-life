# Phase 5 walk-through — Slack on the real workspaces

Built and tested against a scripted Slack (2026-11-09); the backend has polled both real workspaces since Phase 6a.1
(2026-11-10), with the Phase 6c poller fixes from 2026-11-13. These steps check it once against PS Mutuus and Erlia.

1. **Header:** one Slack chip per workspace, named PS Mutuus and Erlia (not the team id), with the time of its last
   successful poll in its tooltip. A chip marked `slack stale` has not polled for more than twice the 60 s interval;
   the backend log (`~/Library/Logs/my-life/backend.log`) then has a `Slack poll failed for workspace …` line naming
   Slack's error (for example `invalid_auth`, `missing_scope`, `ratelimited`).
2. **Triage:** DMs and group DMs with messages from the last 7 days (`MY_LIFE_SLACK_FIRST_POLL_LOOKBACK_DAYS`), messages
   that mention you, and replies in threads you wrote in appear under _Slack_, one card per conversation. A new message
   appears within a minute without a restart. A message from an app shows the app's name.
3. **Open in Slack:** each card's link opens that message (or its thread) in Slack.
4. **Ignore and task:** `i` clears a card; `t` makes a task that shows on _Now_ with the workspace's name as its account
   and a link back to the message, and Done on that task removes it.
5. **Reply:** send a short reply from the composer to a DM you choose, then to a thread; each arrives as you in the right
   place (the thread reply inside the thread), and the card leaves the queue and the waiting-on list.
6. **People and waiting-on:** a Slack sender is listed once with their messages on their timeline; someone whose last
   message you have not answered is on the waiting-on list, and its link opens them on the People tab. A reply in a
   different thread of the same channel does not take them off.
7. **Nothing is sent** except what you pressed Send for.
