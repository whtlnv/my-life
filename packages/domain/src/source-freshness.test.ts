import { describe, expect, it } from 'vitest';

import type { Clock } from './clock';
import { describeSourceFreshness } from './source-freshness';

describe('describeSourceFreshness', () => {
  it('judges a mail source by the Gmail interval while a calendar source keeps its own 5-minute rule', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:10:00.000Z') };
    const pollingIntervalsInMilliseconds = { mail: 60_000, calendar: 5 * 60 * 1000 };
    const sources = [
      { email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:08:20.000Z' },
      { email: 'bob@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:07:50.000Z' },
      { email: 'bob@example.com', source: 'calendar', lastReportedAt: '2026-11-02T15:07:50.000Z' },
    ] as const;

    expect(describeSourceFreshness(sources, pollingIntervalsInMilliseconds, clock)).toEqual([
      { email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:08:20.000Z', stale: false },
      { email: 'bob@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:07:50.000Z', stale: true },
      { email: 'bob@example.com', source: 'calendar', lastReportedAt: '2026-11-02T15:07:50.000Z', stale: false },
    ]);
  });
});
