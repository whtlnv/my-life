import { describe, expect, it } from 'vitest';

import { isAccountFresh } from './account-freshness';
import type { Clock } from './clock';

const FIVE_MINUTES_IN_MILLISECONDS = 5 * 60 * 1000;

describe('isAccountFresh', () => {
  it('reports an account whose last report is within twice its polling interval as fresh', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:07:00.000Z') };
    const account = {
      email: 'francisco@work.example.com',
      lastReportedAt: '2026-11-02T15:00:00.000Z',
      pollingIntervalInMilliseconds: FIVE_MINUTES_IN_MILLISECONDS,
    };

    expect(isAccountFresh(account, clock)).toBe(true);
  });

  it('reports an account whose last report is older than twice its polling interval as stale', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:11:00.000Z') };
    const account = {
      email: 'francisco@work.example.com',
      lastReportedAt: '2026-11-02T15:00:00.000Z',
      pollingIntervalInMilliseconds: FIVE_MINUTES_IN_MILLISECONDS,
    };

    expect(isAccountFresh(account, clock)).toBe(false);
  });
});
