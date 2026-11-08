# Phase 2 walk-through — every account, categories, Gmail filters, the weekly statement

Manual checks over the real accounts, after the code was delivered on 2026-11-07. Tick each line when seen. The
demo (`scripts/demo.sh`, port 7778) shows every page with seeded data without touching a real inbox.

## Extension (each of the four Chrome profiles)

- [ ] `chrome://extensions` → reload the my-life card from `apps/extension/.output/chrome-mv3` (rebuild first with
      `pnpm --filter @my-life/extension build`) and accept the new Google consent: it now lists Gmail settings
      (`gmail.settings.basic`) beside Gmail and Calendar.
- [ ] `http://127.0.0.1:7777/` shows every account's chip green within two minutes (calendar and mail both reported).

## Triage over every account

- [ ] `#/triage` lists items from more than one account; each card and row says which account it came from.
- [ ] A mail where you are only in Cc never appears under _Needs you_, even when Claude proposed `action`.
- [ ] A rejected verdict that is re-decided later follows the latest decision (the archive command appears or
      disappears accordingly within a minute).

## Categories (`#/categories`)

- [ ] Each category shows its agreement rate (or _no proposals yet_) before its switch; expanding one lists its five
      most recent proposals with a working Gmail link.
- [ ] Switch `calendar-drive` to _automatic_: the next calendar or Drive notice leaves the inbox on its own, carrying
      the Gmail label `my-life/auto`, and appears on the triage page only under _Handled for you_, where undo
      returns it to the inbox.
- [ ] A proposal made while the category was _advise_ still waits for your confirmation after the switch.
- [ ] The kill switch returns every category to _advise_; a new proposal in that category waits again.
- [ ] Restart the backend (`launchctl kickstart -k gui/$(id -u)/mx.erlia.my-life.backend`): the modes and the
      automatic decisions survive.

## Filters (`#/filters`)

- [ ] After the third confirmed archive from the same sender (or List-Id) in one account, a filter proposal appears
      within a minute, with the sender, a `my-life/...` label and the count of archives behind it. Spend for the call
      is logged.
- [ ] Reject one: it disappears and the same sender is never proposed again.
- [ ] Approve one: within a minute the filter exists in that account's Gmail settings (Settings → Filters and blocked
      addresses) with the label created and _Skip the Inbox_ set; the page moves it to _Created filters_ with the
      approval and creation times.
- [ ] Delete it from the page: the filter is gone from Gmail within a minute and from the page after that.

## Statement (`#/statement`)

- [ ] The current week lists every confirmed expense across accounts, dated inside Monday–Sunday
      (`America/Mexico_City`), with a total per currency; a rejected expense proposal is absent.
- [ ] Previous / next week move the table; _Download CSV_ saves the week's file and it opens in a spreadsheet with
      the header `vendor,amount,currency,date,account,link`.

## Spend

- [ ] `~/Library/Application Support/my-life/my-life.sqlite` → `spend` holds one row per triage call and per filter
      call; the day's total matches the Anthropic console within a few percent.

## Screenshots

`docs/screenshots/2026-11-07-phase-2-categories.jpg`, `-filters.jpg`, `-statement.jpg` are over the demo backend;
replace them with real-inbox ones once the extension is reloaded.
