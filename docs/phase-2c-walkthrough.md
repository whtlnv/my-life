# Phase 2c walk-through — digests and Handled for you

Manual checks over the real accounts, after the code was delivered on 2026-11-08. Do `docs/phase-2b-walkthrough.md`
first (contacts scopes, backend restart, one re-consent per profile). The demo (`scripts/demo.sh`, port 7778) shows
the same page seeded; screenshots are `docs/screenshots/2026-11-08-phase-2c-triage-*.jpg`.

## Digests

- [ ] `http://127.0.0.1:7777/#/triage` lists system updates, sales and calendar or Drive notices as digests, one per
      account and system (or sender), never one message at a time. Expenses and cc threads still show as groups.
- [ ] Each digest heading reads like "AWS: 5 notices since Tuesday, 1 significant: production budget at 85%" and
      matches the messages behind it; significant items are listed with a link that opens the message in Gmail.
- [ ] Confirm one digest: its `archive` items leave the inbox within a minute (labeled `my-life/archived`), its
      `keep` items stay; the next notice from the same system opens a fresh digest.
- [ ] Summary spend (Haiku 5.5, `MY_LIFE_SUMMARY_MODEL`) shows in the spend log and stays well under the daily
      ceiling.

## Handled for you

- [ ] Switch a category to automatic (Categories tab). Its work today appears collapsed under _Handled for you_ with
      a count.
- [ ] Undo one item: within a minute the message is back in the inbox without the `my-life/auto` label, and it no
      longer appears in the strip, also after a backend restart.
