# TODO.md — working set

## Phase 0 — Tooling, auth spike, calendar skeleton

Monorepo, lint wall, `/tdd-init` files, dependency-direction test and CI are already delivered (commits c1d45dc, 75ec1a7). The `chrome.identity` spike and the final manual walk-through wait on `PENDING_TASKS.md` § 1.

### Shared contract

- [x] A calendar snapshot carrying the account email and events with id, iCalUID, title, start, end, optional Meet link and attendees passes the shared contract
- [x] A calendar snapshot whose event has no start fails the shared contract
- [x] An all-day event given as a date without a time passes the shared contract
- [ ] A calendar snapshot whose event has no Meet link passes the shared contract

### Domain — merge and dedupe

- [ ] Merging the snapshots of two accounts yields the events of both
- [ ] The same event (same iCalUID) reported by two accounts appears once, naming both accounts
- [ ] Two events with different iCalUIDs at the same time stay separate

### Domain — now, next, later today

- [ ] An event that has started and not ended is reported as current
- [ ] An event that has already ended is not reported as current
- [ ] An event starting within 15 minutes is reported as next
- [ ] An event starting in more than 15 minutes is not reported as next
- [ ] When two events overlap at the current time, both are reported as current, earliest start first
- [ ] Events starting after the next window and before midnight in America/Mexico_City are listed as later today in time order
- [ ] An event starting after midnight in America/Mexico_City is left out of later today even when it is still the same UTC day
- [ ] An event that has already ended is left out of later today
- [ ] An all-day event for today is not reported as current
- [ ] An all-day event for today is listed in later today ahead of the timed events

### Domain — freshness and badge

- [ ] An account whose last report is within twice its polling interval is fresh
- [ ] An account whose last report is older than twice its polling interval is stale
- [ ] The badge count equals the number of events starting within 15 minutes
- [ ] An event already in progress does not add to the badge count

### Backend

- [ ] A registration from an email in the allow-list is accepted
- [ ] A registration from an email not in the allow-list is refused
- [ ] A calendar snapshot posted by an allow-listed account answers success and its events appear in GET /now
- [ ] A calendar snapshot posted by an account outside the allow-list is refused and none of its events appear in GET /now
- [ ] A calendar snapshot that fails the shared contract is refused with a client error
- [ ] GET /now merges the snapshots of two accounts, showing a cross-account duplicate once
- [ ] A newer snapshot from the same account replaces that account's events in GET /now, and an event missing from it disappears
- [ ] GET /now reports, for each account, when it last reported and whether it is stale
- [ ] GET /now includes the badge count of events starting within 15 minutes
- [ ] A snapshot reported before a backend restart is still served by GET /now after it
- [ ] When no database path is configured, the backend stores its file under `~/Library/Application Support/my-life/`
- [ ] GET / serves the dashboard build's index page

### Extension

- [ ] A Google Calendar events response is converted into a snapshot with title, start, end, Meet link, attendees and iCalUID
- [ ] An event the account has declined is left out of the snapshot
- [ ] An all-day Calendar event becomes an all-day event in the snapshot
- [ ] Every calendar the account can see is polled
- [ ] Calendars named Holidays or Birthdays are not polled
- [ ] The time window requested from Calendar covers today and tomorrow in America/Mexico_City
- [ ] A 429 or 5xx answer from Calendar is retried with backoff and the snapshot is posted once it succeeds
- [ ] A 4xx answer other than 429 is not retried and is reported as an error
- [ ] On start the extension registers with the backend using the profile's account email, then posts the first snapshot
- [ ] The badge shows the count returned by the backend and is empty when the count is zero

### Calendar fake server (integration suite)

- [ ] Polling the fake Calendar server's `empty` scenario yields a snapshot with no events and GET /now shows nothing current or next
- [ ] Polling the `overlapping` scenario yields two events that GET /now reports as both current
- [ ] Polling the `all-day` scenario yields an event GET /now lists in later today and not as current
- [ ] Two accounts polling the `cross-account-duplicate` scenario yield one event in GET /now naming both accounts

### Dashboard

- [ ] The Now block shows the current event's title, join link and attendees
- [ ] When nothing is current or next, the Now block says there is nothing now
- [ ] A next event shows in the Now block with the minutes until it starts
- [ ] Later today lists the remaining events in time order with their start times
- [ ] Each account shows when it last reported
- [ ] A stale account is marked stale
- [ ] A fresh account carries no stale marker
- [ ] The Now block updates without a page reload when the backend's answer changes

### Wiring and acceptance

- [ ] Running the backend entry point serves the built dashboard at `/` and answers GET /now from the configured store
- [ ] The launchd plist in `scripts/` validates with plutil and points at the backend's start command
- [ ] Manual checklist in `docs/` walked: extension installed in each profile, every account appears on the dashboard, the badge shows the count; screenshot saved (waits on `PENDING_TASKS.md` § 1)
