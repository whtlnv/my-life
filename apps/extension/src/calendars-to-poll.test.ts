import { describe, expect, it } from 'vitest';

import { calendarIdsToPoll } from './calendars-to-poll';

describe('calendarIdsToPoll', () => {
  it('polls every calendar the account can see', () => {
    const calendarListResponse = {
      kind: 'calendar#calendarList',
      items: [
        {
          kind: 'calendar#calendarListEntry',
          id: 'francisco@example.com',
          summary: 'Francisco',
          primary: true,
          accessRole: 'owner',
        },
        {
          kind: 'calendar#calendarListEntry',
          id: 'team@group.calendar.google.com',
          summary: 'Team',
          accessRole: 'writer',
        },
        { kind: 'calendar#calendarListEntry', id: 'ana@example.com', summary: 'Ana', accessRole: 'reader' },
      ],
    };

    expect(calendarIdsToPoll(calendarListResponse)).toEqual([
      'francisco@example.com',
      'team@group.calendar.google.com',
      'ana@example.com',
    ]);
  });

  it('does not poll calendars named Holidays or Birthdays', () => {
    const calendarListResponse = {
      kind: 'calendar#calendarList',
      items: [
        {
          kind: 'calendar#calendarListEntry',
          id: 'francisco@example.com',
          summary: 'Francisco',
          primary: true,
          accessRole: 'owner',
        },
        {
          kind: 'calendar#calendarListEntry',
          id: 'en.mexican#holiday@group.v.calendar.google.com',
          summary: 'Holidays',
          accessRole: 'reader',
        },
        {
          kind: 'calendar#calendarListEntry',
          id: 'addressbook#contacts@group.v.calendar.google.com',
          summary: 'Birthdays',
          accessRole: 'reader',
        },
      ],
    };

    expect(calendarIdsToPoll(calendarListResponse)).toEqual(['francisco@example.com']);
  });

  it('does not poll Google holiday and birthday calendars whatever their localized name', () => {
    const calendarListResponse = {
      kind: 'calendar#calendarList',
      items: [
        {
          kind: 'calendar#calendarListEntry',
          id: 'francisco@example.com',
          summary: 'Francisco',
          primary: true,
          accessRole: 'owner',
        },
        {
          kind: 'calendar#calendarListEntry',
          id: 'es.mexican#holiday@group.v.calendar.google.com',
          summary: 'Días festivos en México',
          accessRole: 'reader',
        },
        {
          kind: 'calendar#calendarListEntry',
          id: 'addressbook#contacts@group.v.calendar.google.com',
          summary: 'Cumpleaños',
          accessRole: 'reader',
        },
      ],
    };

    expect(calendarIdsToPoll(calendarListResponse)).toEqual(['francisco@example.com']);
  });
});
