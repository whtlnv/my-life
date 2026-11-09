# Phase 3 walk-through — People, Needs input, tasks

Manual checks over the real accounts, after the code was delivered on 2026-11-08. Do `docs/phase-2b-walkthrough.md`
and `docs/phase-2c-walkthrough.md` first (contacts scopes, backend restart, one re-consent per profile; the
re-consent also starts reporting your sent mail). The demo (`scripts/demo.sh`, port 7778) shows the same pages seeded;
screenshots are `docs/screenshots/2026-11-08-phase-3-*.jpg`.

## People

- [ ] `http://127.0.0.1:7777/#/people` lists VIP (your starred contacts and each profile's `- Always matters:` line),
      Urgent with its reason, and Everyone else, each by most recent message.
- [ ] Someone who asked you something two business days ago, with no reply from you in the thread, is Urgent with
      "unanswered ask"; replying in Gmail takes them off after the next poll.
- [ ] Clicking a contact or an organization shows its timeline beside the lists; mark and remove VIP from a row.

## Needs input

- [ ] The tab's count matches the questions listed. A category question shows the message's subject, summary and
      sender; a new-sender question shows the sender and what they asked. Number keys answer the first question.
- [ ] An answered question does not come back, also after a backend restart.
- [ ] Task proposals made from your mail's asks are listed; `c` confirms and `r` rejects the first one.

## Tasks and _now_

- [ ] After the first prioritization pass (on the backend's schedule, or `curl -X POST 127.0.0.1:7777/prioritization-run`),
      the _now_ page shows the top 3 tasks with a reason each; Done removes one.
- [ ] Waiting on you lists the people whose last message to you has no reply, longest wait first; each name opens
      their timeline on the People tab.
- [ ] Prioritization spend (Opus 5.5, `MY_LIFE_PRIORITIZATION_MODEL`) shows in the spend log and stays under the
      daily ceiling.
