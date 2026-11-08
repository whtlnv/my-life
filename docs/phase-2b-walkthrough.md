# Phase 2b walk-through — bodies, extraction v2, contacts

Manual checks over the real accounts, after the code was delivered on 2026-11-08. Tick each line when seen. The demo
(`scripts/demo.sh`, port 7778) shows the body-driven summaries and the imported contacts without touching a real inbox.

## Before

- [ ] `PENDING_TASKS.md` § 9: the contacts scopes (`https://www.googleapis.com/auth/contacts.readonly`,
      `https://www.googleapis.com/auth/contacts.other.readonly`) are on the OAuth consent screen (the People API is
      enabled since 2026-11-08).
- [ ] Restart the backend on the new build (`launchctl kickstart -k gui/$(id -u)/com.my-life.backend`). It opens the
      existing database unchanged; the first triage run retriages every message whose body arrives.

## Extension (each of the four Chrome profiles)

- [ ] Rebuild (`pnpm --filter @my-life/extension build`), revoke the cached token in `chrome://identity-internals`,
      reload the my-life card and accept the consent: it now lists Contacts and Other Contacts beside Gmail (settings
      included) and Calendar. This also clears the Gmail 403 three profiles answered since Phase 2.
- [ ] `http://127.0.0.1:7777/` shows every account's chip green within two minutes.

## Bodies and retriage

- [ ] Within a few polls every stored message has a body (`GET /bodies-missing?account=<email>` answers an empty list).
- [ ] Triage summaries name facts that are only in the body, not in the first line.
- [ ] Spend for the retriage stays under the daily ceiling (`GET /now` badge and the spend log).

## Contacts and search

- [ ] `GET /contacts` lists your Google contacts with their organization and labels as lists; starred ones carry `vip`.
- [ ] Remove `vip` from one starred contact (`DELETE /contacts/<email>/marks/vip`): after the next daily import and a
      backend restart it is still unmarked.
- [ ] `GET /organizations` groups messages by organization; free-mail senders (gmail.com, outlook.com…) have none.
- [ ] `GET /search?q=<a word only in a body>` finds that message.
