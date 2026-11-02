import { describe, expect, it } from 'vitest';

import { mergeCalendarSnapshots } from './merge-calendar-snapshots';

const weeklySync = {
  id: 'event-1',
  iCalUID: 'event-1@google.com',
  title: 'Weekly sync',
  start: '2026-11-02T15:00:00.000Z',
  end: '2026-11-02T15:30:00.000Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'ana@example.com', displayName: 'Ana' }],
};
const dentist = {
  id: 'event-2',
  iCalUID: 'event-2@google.com',
  title: 'Dentist',
  start: '2026-11-02T17:00:00.000Z',
  end: '2026-11-02T18:00:00.000Z',
  attendees: [],
};

describe('mergeCalendarSnapshots', () => {
  it('yields the events of both accounts, each naming the account it came from', () => {
    const work = { accountEmail: 'francisco@work.example.com', events: [weeklySync] };
    const personal = { accountEmail: 'francisco@personal.example.com', events: [dentist] };

    const merged = mergeCalendarSnapshots([work, personal]);

    expect(merged).toEqual([
      { ...weeklySync, accounts: ['francisco@work.example.com'] },
      { ...dentist, accounts: ['francisco@personal.example.com'] },
    ]);
  });

  it('reports the same event seen by two accounts once, naming both accounts', () => {
    const work = { accountEmail: 'francisco@work.example.com', events: [weeklySync] };
    const personal = {
      accountEmail: 'francisco@personal.example.com',
      events: [{ ...weeklySync, id: 'event-1-as-seen-by-personal' }],
    };

    const merged = mergeCalendarSnapshots([work, personal]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.iCalUID).toBe(weeklySync.iCalUID);
    expect(merged[0]?.accounts).toEqual([
      'francisco@work.example.com',
      'francisco@personal.example.com',
    ]);
  });
});
