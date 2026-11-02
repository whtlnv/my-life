import { describe, expect, it } from 'vitest';

import { calendarIdsToPoll } from './calendars-to-poll';

describe('calendarIdsToPoll', () => {
  it('polls every calendar the account can see', () => {
    const calendarListResponse = {
      kind: 'calendar#calendarList',
      items: [
        { kind: 'calendar#calendarListEntry', id: 'francisco@example.com', summary: 'Francisco', primary: true, accessRole: 'owner' },
        { kind: 'calendar#calendarListEntry', id: 'team@group.calendar.google.com', summary: 'Team', accessRole: 'writer' },
        { kind: 'calendar#calendarListEntry', id: 'ana@example.com', summary: 'Ana', accessRole: 'reader' },
      ],
    };

    expect(calendarIdsToPoll(calendarListResponse)).toEqual([
      'francisco@example.com',
      'team@group.calendar.google.com',
      'ana@example.com',
    ]);
  });
});
