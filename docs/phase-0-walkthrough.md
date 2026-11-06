# Phase 0 walk-through (manual checklist)

The glue the unit suite cannot reach, verified by hand once `PENDING_TASKS.md` § 1 (Google Cloud project, OAuth client
for extension id `goknkpgifknnopfpldahflhndahempki`) is done. Tick each line; save the screenshot under
`docs/screenshots/` with the date in its name.

## Backend

- [x] `cp .env.example .env`, fill `MY_LIFE_ALLOWED_EMAILS` with every account's email. (2026-11-06, 4 accounts)
- [x] (2026-11-06; the repo had to move out of `~/Desktop`, which macOS privacy protection hides from launchd) `pnpm --filter @my-life/dashboard build`, then `scripts/install-launchd.sh`. `tail -f ~/Library/Logs/my-life/backend.log`
      shows `my-life backend listening on http://127.0.0.1:7777 · N allowed account(s)`.
- [x] (2026-11-06) `http://127.0.0.1:7777/` in any profile shows the dashboard with _Loading_, then _Nothing now_ and an empty account list.

## The chrome.identity spike (locked decision 2)

- [x] `apps/extension/.env` holds `WXT_GOOGLE_OAUTH_CLIENT_ID`; `pnpm --filter @my-life/extension build`. (2026-11-06; the built manifest carries the client id)
- [x] (2026-11-06, four profiles) In **each** Chrome profile: `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/.output/chrome-mv3`.
      The id shown is `goknkpgifknnopfpldahflhndahempki` (if not, the manifest `key` did not apply).
- [x] (2026-11-06) The first load asks for consent once per profile (Workspace and gmail.com alike). The service-worker console shows no
      `my-life extension failed to start` line.
- [x] (2026-11-06 17:47 Mexico City, all four accounts fresh, each polling on its own 5-minute alarm) Every account appears on the dashboard's account list with a fresh _last reported_ time.
- [ ] **Three days later** (check on 2026-11-09), without re-consent: every account still reports (no stale marker, no console error).
      Record the outcome in `docs/decisions/<date>-chrome-identity-tokens.md`; on failure, switch to the IMAP + iCal fallback.

## Badge and now view

- [ ] Create a test event starting in 10 minutes on one calendar: within 5 minutes the badge shows `1` on that profile and the
      event appears under _Now_ with its minutes until start; when it starts, it moves to the current block with its join link.
- [ ] Clicking the extension icon opens the dashboard.
- [x] Screenshot of the dashboard with all accounts listed → `docs/screenshots/2026-11-06-phase-0-dashboard.jpg`.
