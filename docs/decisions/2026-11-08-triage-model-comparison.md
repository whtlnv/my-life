# 2026-11-08 — Triage model comparison: Haiku first, Opus as the second opinion

**Question.** Triage ran on Opus 5.5 at about 1.5 cents a message. Can a cheaper model do the same job?

**Method.** `apps/backend/scripts/compare-triage-models.ts` re-triaged the 56 messages the production store held
(all from `it@icona.fun`, the first inbox to report) with Haiku 5.5, Sonnet 5.5 and Opus 5.5, from headers only:
the store kept no snippet at the time. The stored Opus proposals, which had the snippet, were the reference.

| Model, headers only | Cost for 56 | Per message | Category agrees with stored Opus | Action agrees |
| ------------------- | ----------- | ----------- | -------------------------------- | ------------- |
| Haiku 5.5           | USD 0.03    | 0.05 ¢      | 50 / 56                          | 45 / 56       |
| Sonnet 5.5          | USD 0.41    | 0.7 ¢       | 52 / 56                          | 43 / 56       |
| Opus 5.5            | USD 0.85    | 1.5 ¢       | 54 / 56                          | 41 / 56       |

**Findings.**

- Haiku matched Opus on the category 89% of the time at one thirtieth of the price. Of its six misses, two were
  defensible (AWS marketing as `sales`, which Opus itself chose when re-run) and two would have added noise to
  _Needs you_ (a calendar invitation and a verify-your-email notice filed as `action`). It missed neither of the two
  real `action` items.
- The keep/archive `action` is noisy for every model: re-run on headers, Opus changed its own answer on 15 of 56
  messages. All three models agreed on the action for only 39 messages. That is a prompt and profile gap (this
  account had no profile file), not a model gap.
- Summaries read alike; Opus is slightly more precise about what a message is.
- Caveat: 41 of the 56 messages were system updates, the easiest category. People mail, Cc threads and expenses
  (psmutuus) were not in the sample.

**Decision (user, 2026-11-08).** Haiku 5.5 triages every message; Opus 5.5 gives a second opinion only when Haiku
says `action` or `unknown`, or fails to answer, and its proposal wins (`apps/backend/src/escalating-triage.ts`,
`MY_LIFE_TRIAGE_MODEL` / `MY_LIFE_TRIAGE_ESCALATION_MODEL`, `none` disables the second opinion). Filter proposals
stay on the escalation model. The store now keeps each message's snippet, so the comparison can be repeated fairly
on psmutuus once it has been triaged: run the script again with `MODELS=claude-haiku-5-5,claude-opus-5-5`.

**Cost expectation.** With this inbox's mix (2 of 56 escalated), about 0.1 ¢ a message instead of 1.5 ¢.
