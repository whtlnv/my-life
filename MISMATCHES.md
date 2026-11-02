# TDD Prediction Mismatches

Append-only audit log of `/red` prediction mismatches and their resolutions. Newest first. Never edit or delete prior entries — that destroys the audit trail.

## 2026-11-02 09:35 · `packages/contracts/src/calendar-snapshot.test.ts::rejects a snapshot whose event has no start`
- Behavior: a calendar snapshot whose event has no start fails the shared contract
- Predicted: test passes on first run — `start: z.string()` is already required by the schema from the previous green step
- Actual: test passed on first run, exactly as predicted
- Type: passed unexpectedly
- Resolution: the TODO item restates behavior the first contract item already delivered; the test is kept as a non-vacuous pin (it asserts `safeParse` fails on a real snapshot missing `start`), and `/green` has nothing to implement for it.
