# Gemini meeting-notes fixtures and their fidelity gap (2026-11-14)

## What the fixtures are

Phase 7 reads Gemini's meeting-notes docs from Drive. Every notes fixture in `packages/domain/src/gemini-notes-*.fixture.txt`
was **written by hand** from Gemini's documented layout, not copied from a real doc. The names in them (Lucía Ferrer,
Tomás Ibarra, Marta Quiroga and the others) are made up. No real meeting notes are in the repository.

The layout they assume is a meeting title line, a `Notes by Gemini` line, a date, an attendee list, then `Summary`,
`Details` and an action-item section headed `Suggested next steps` (or `Action items`), one item per line.

## What the code relies on

- **Finding the docs:** the extension (`apps/extension/src/notes-poll.ts`) lists Google Docs whose name contains
  `Notes by Gemini`, modified since the last successful poll, and exports each one as `text/plain`.
- **The action-item section:** `notesActionItems` (`packages/domain/src/notes-parser.ts`) starts at a line that is
  exactly `Suggested next steps` or `Action items`. It stops at the first blank line or a `Details` heading.
- **Assignees:** a line starting `[Name] ` is assigned to Name. So is a line whose words before ` will ` are all
  capitalized (`Lucía Ferrer will …`). Any other line has no assignee.
- **Who is the user:** `MY_LIFE_USER_NAMES` (a comma list) keeps items assigned to one of those names. Items with no
  assignee are always kept, and when the variable is unset every item is kept.

## The fidelity gap

None of the above has been checked against a real Gemini doc. Until one is, these are the likely ways a real doc could
differ:

- **Bullets or checkboxes.** Drive's `text/plain` export may prefix list items with `* `, `- ` or `☐ `. The parser does
  not strip them. Items would still be found, but the bracket and ` will ` assignee forms would not match.
- **Heading wording or language.** A heading other than the two exact strings (a different wording, a trailing colon,
  a Spanish-language doc) yields no items.
- **Doc name.** A notes doc whose name does not contain `Notes by Gemini` is never listed.
- **Blank lines inside the section.** A blank line between items ends the section early.

**How to close it:** when the first real notes doc arrives, compare it with these fixtures (`PENDING_TASKS.md`). Save a
trimmed copy with the names replaced as a new fixture, and drive any difference through a failing parser test.
