# Phase 1 walk-through (manual checklist)

The glue the unit and integration suites cannot reach, verified by hand against `franciscoc@psmutuus.com`. Tick each
line; save the screenshot under `docs/screenshots/` with the date in its name.

## Backend

- [x] (2026-11-07) `.env` holds `ANTHROPIC_API_KEY`; the launchd backend's startup line ends with
      `· triage and filter proposals with claude-opus-5-5, ceiling USD 20/day`. Without the key it says `triage disabled: ANTHROPIC_API_KEY is not set`.
- [x] (2026-11-07) One live call through the real adapter on a synthetic AWS budget email returned a valid `system-update`
      proposal flagged `significant` for USD 0.018 (strict `propose_triage` tool accepted by the API).

## Extension (per profile, psmutuus first)

- [ ] `chrome://extensions` → reload the my-life card (the build now asks for `gmail.modify`). The next start shows a
      Google consent prompt listing Gmail; accept it. The service-worker console shows no `my-life extension failed to start`
      and no `Gmail poll failed` line.
- [ ] Within a minute the backend log shows the account's mail report (`GET /now` lists the account under `sources` with
      a fresh mail time) and `GET /triage-queue` shows `remaining` dropping as the 30-second triage runs eat the backlog.
      Expect roughly USD 0.02 per message; the ceiling pauses triage at USD 20 and the page says so.

## Triage page

- [ ] `http://127.0.0.1:7777/#/triage`: the `action` block first (cards with who, what, by when), then one collapsed
      group per category with its count, the remaining count and the fetched-at time.
- [ ] Keys on a focused card: `t` makes a task, `k` keeps, `a` archives, `r` opens the correction prompt (pick a
      category, type a note, Enter; Escape cancels). `c` on a focused group confirms the whole group. Each accepted
      verdict removes its card or group.
- [ ] A confirmed archive disappears from the Gmail inbox within a minute and carries the label `my-life/archived`
      (the extension carries the command out on its next poll and acknowledges it).
- [ ] A confirmed `act` appears in `GET /tasks` with its title, Gmail link and account; a kept `sales` pitch appears in
      `GET /check-later`.
- [ ] The Gmail link on a card (`https://mail.google.com/mail/?authuser=<email>#all/<id>`) opens the right message.
- [ ] Screenshot of the triage page over the real inbox with the action block, the groups and the remaining count →
      `docs/screenshots/<date>-phase-1-triage.png`.

## Spend

- [ ] `sqlite3 ~/Library/Application\ Support/my-life/my-life.sqlite 'select count(*), round(sum(cost_in_usd),2) from spend'`
      after the first day matches the Anthropic console within a few cents.
