import { describe, expect, it } from 'vitest';

import type { Clock } from './clock';
import { isTriagePaused } from './triage-spend';

describe('isTriagePaused', () => {
  it.each([
    {
      rule: 'pauses triage when the spend logged today in America/Mexico_City reaches the daily ceiling',
      spendLog: [
        { loggedAt: '2026-11-06T15:00:00.000Z', costInUsd: 12 },
        { loggedAt: '2026-11-06T17:00:00.000Z', costInUsd: 8 },
      ],
      paused: true,
    },
    {
      rule: 'does not pause triage when the spend logged today stays below the daily ceiling',
      spendLog: [
        { loggedAt: '2026-11-06T15:00:00.000Z', costInUsd: 12 },
        { loggedAt: '2026-11-06T17:00:00.000Z', costInUsd: 7.99 },
      ],
      paused: false,
    },
    {
      rule: 'does not count spend logged before midnight in America/Mexico_City toward today’s ceiling',
      spendLog: [
        { loggedAt: '2026-11-06T05:30:00.000Z', costInUsd: 15 },
        { loggedAt: '2026-11-06T17:00:00.000Z', costInUsd: 8 },
      ],
      paused: false,
    },
  ])('$rule', ({ spendLog, paused }) => {
    const clock: Clock = { now: () => new Date('2026-11-06T18:00:00.000Z') };

    expect(isTriagePaused(spendLog, { dailyCeilingInUsd: 20, timeZone: 'America/Mexico_City' }, clock)).toBe(paused);
  });
});
