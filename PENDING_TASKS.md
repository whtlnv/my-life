# PENDING_TASKS.md

What the user owes the project: accounts, approvals, credentials and decisions only the user can provide. Written 2026-10-29. Delete an entry when it's done; Claude acts on each one once it's handed over. Engineering work lives in `PLAN.md`; deferred gaps in `BACKLOG.md`. **This file is not a work queue** (see `CLAUDE.md`).

## 1. Start today — Google Cloud project and OAuth client (Phase 0's spike waits on it)

- [ ] **One Google Cloud project** (any of your accounts can own it; a Workspace one you administer is simplest). Enable the **Gmail API**, **Google Calendar API** and **Google Drive API**.
- [ ] **OAuth consent screen**: user type _External_, publishing status _Testing_. Add **every Google account you want aggregated** as a test user (the Workspace ones and the gmail.com ones). Scopes to list: `calendar.readonly`, `gmail.modify`, `gmail.settings.basic`, `contacts.readonly`, `contacts.other.readonly`, `drive.readonly`, `userinfo.email`.
- [ ] **OAuth client of type _Chrome Extension_** with the extension ID `goknkpgifknnopfpldahflhndahempki` (fixed by the `key` in `apps/extension/wxt.config.ts`; the private key is at `~/Library/Application Support/my-life/extension-key.pem`, never in git). Paste the client ID into `apps/extension/.env` as `WXT_GOOGLE_OAUTH_CLIENT_ID=…` (see `.env.example`).
- [ ] **List the accounts**: for each, the email, whether it is Workspace or gmail.com, and what it is for (one line each). Goes in `profile/accounts.md` and the backend allow-list.

## 2. Anthropic API key (Phase 1)

- [x] Your own key → local `.env` as `ANTHROPIC_API_KEY`. Never in git. (2026-11-06)

## 3. Profile (Phase 1)

- [ ] (`profile/psmutuus.md` started 2026-11-06 from the user's description; the other three accounts and the people lists are still open) Fill `profile/`: each account's purpose, the people whose messages always matter, the people whose messages never do, what you are working on this month, and anything that should always become a task (invoices, contracts, approvals...).

## 4. Todo list (Phase 3)

- [ ] The path to your markdown/text todo list. Default format: one task per line or checkbox; headings become tags. If it looks different, say so.

## 5. Slack app (Phase 4)

- [x] Create a Slack app with **user token scopes** `channels:history`, `groups:history`, `im:history`, `mpim:history`, `channels:read`, `groups:read`, `im:read`, `mpim:read`, `users:read`, `search:read`, `chat:write`. Redirect URL: the localhost one Claude gives you.
- [x] One app per workspace, client ids and secrets in `.env` (2026-11-09).
- [x] In each app: **Reinstall to Workspace** (the scopes changed), then copy OAuth & Permissions → **User OAuth Token** (`xoxp-…`) into `.env` as `MY_LIFE_SLACK_WORKSPACE_1_USER_TOKEN` / `_2_`.
- [x] `profile/accounts.md` names the workspaces: `T027T2P54BW` is PS Mutuus, `T099H5TTQE8` is Erlia.

## 6. Telegram (Phase 6)

- [x] `api_id` and `api_hash` from https://my.telegram.org under your account → `.env`.
- [x] One interactive phone login when Phase 6 starts (Claude runs the script, you type the code). Done 2026-11-10; the live backend reads Telegram.

## 7. Decisions and confirmations (each has a default so nothing waits)

- [x] **Daily LLM spend ceiling and model.** Decided 2026-11-06: Opus 5.5 for classification and prioritization, ceiling USD 20 per day (raise it in config for the first-day backfill if needed); triage pauses and the dashboard says so when reached.
- [ ] **Which calendars per account.** Default: every calendar the account can see, except declined events and calendars named _Holidays_ / _Birthdays_.
- [x] **Triage categories to start with.** Decided 2026-11-06 with the user: `action`, `cc-thread`, `expense`, `system-update`, `sales`, `calendar-drive`, `unknown` (`PLAN.md` Phase 1). All start in `advise`.
- [ ] **How many confirmed archives from the same sender before a filter is proposed.** Default: 3.
- [ ] **Which profile keeps `web.whatsapp.com` open.** Default: the first one you install the extension in.
- [ ] **Business time zone.** Default: `America/Mexico_City`.

## 8. The Mac

- [ ] Confirm the Mac stays on and Chrome stays open (locked decision 1). Claude provides the launchd plist for the backend in Phase 0; you install it once.

## 9. People API (Phase 2b)

- [ ] Enable the **People API** in the Google Cloud project (the legacy Contacts API is gone), then add the scopes to the OAuth consent screen by their full URIs: `https://www.googleapis.com/auth/contacts.readonly` and `https://www.googleapis.com/auth/contacts.other.readonly` (the manual box rejects the short names; once the API is enabled they also appear in the scope picker under People API). Each profile then needs one more consent (reload the extension card; revoke the cached token in `chrome://identity-internals` first if the prompt does not appear).
