import { describe, expect, it } from 'vitest';

import { badgeCount } from './badge-count';
import type { Clock } from './clock';

const weeklySync = {
  id: 'event-1',
  iCalUID: 'event-1@google.com',
  title: 'Weekly sync',
  start: '2026-11-02T15:00:00.000Z',
  end: '2026-11-02T15:30:00.000Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'ana@example.com', displayName: 'Ana' }],
  accounts: ['francisco@work.example.com'],
};

const designReview = {
  id: 'event-2',
  iCalUID: 'event-2@google.com',
  title: 'Design review',
  start: '2026-11-02T15:05:00.000Z',
  end: '2026-11-02T15:45:00.000Z',
  meetLink: 'https://meet.google.com/klm-nopq-rst',
  attendees: [{ email: 'luis@example.com', displayName: 'Luis' }],
  accounts: ['francisco@personal.example.com'],
};

const retrospective = {
  id: 'event-3',
  iCalUID: 'event-3@google.com',
  title: 'Retrospective',
  start: '2026-11-02T16:00:00.000Z',
  end: '2026-11-02T16:30:00.000Z',
  attendees: [],
  accounts: ['francisco@work.example.com'],
};

describe('badgeCount', () => {
  it('equals the number of events starting within 15 minutes', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T14:50:00.000Z') };

    expect(badgeCount([weeklySync, designReview, retrospective], clock)).toBe(2);
  });
});
