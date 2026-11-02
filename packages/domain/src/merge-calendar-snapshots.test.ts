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
});
