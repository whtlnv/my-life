# profile/

The user's hand-written context for the LLM (CLAUDE.md locked decision 13): each account's purpose, the people who
always matter, the people who never do, this month's priorities, and what should always become a task. Everything
here except this file and the `*.example.md` templates is gitignored. The triage prompt gets `accounts.md` plus the file named after the account's domain (`psmutuus.md` for `…@psmutuus.com`) when it exists; no other file here reaches it. The prioritization prompt gets the domain file of each account an open task comes from, and an email on a domain file's `- Always matters:` line is listed as VIP on the People tab unless the user removed the mark.
