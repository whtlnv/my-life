import { describe, expect, it } from 'vitest';

import type { Clock } from './clock';
import { buildNowView } from './now-view';

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

describe('buildNowView', () => {
  it('reports an event that has started and not ended as current', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:10:00.000Z') };

    const view = buildNowView([weeklySync], clock);

    expect(view.current).toEqual([weeklySync]);
  });

  it('does not report an event that has already ended as current', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:45:00.000Z') };

    const view = buildNowView([weeklySync], clock);

    expect(view.current).toEqual([]);
  });

  it('reports an event starting within 15 minutes as next', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T14:50:00.000Z') };

    const view = buildNowView([weeklySync], clock);

    expect(view.next).toEqual([weeklySync]);
  });

  it('does not report an event starting in more than 15 minutes as next', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T14:30:00.000Z') };

    const view = buildNowView([weeklySync], clock);

    expect(view.next).toEqual([]);
  });

  it('reports two overlapping events as current, earliest start first', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:10:00.000Z') };

    const view = buildNowView([designReview, weeklySync], clock);

    expect(view.current).toEqual([weeklySync, designReview]);
  });

  it('lists events starting after the next window and before midnight in America/Mexico_City as later today in time order', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T14:00:00.000Z') };

    const view = buildNowView([designReview, weeklySync], clock, 'America/Mexico_City');

    expect(view.laterToday).toEqual([weeklySync, designReview]);
  });

  it('leaves an event starting after midnight in America/Mexico_City out of later today even when it is still the same UTC day', () => {
    // 04:00Z on Nov 3 is 22:00 on Nov 2 in Mexico City; the event is 00:30 on Nov 3 there.
    const clock: Clock = { now: () => new Date('2026-11-03T04:00:00.000Z') };
    const afterMidnightStandup = {
      ...weeklySync,
      id: 'event-3',
      iCalUID: 'event-3@google.com',
      title: 'After-midnight standup',
      start: '2026-11-03T06:30:00.000Z',
      end: '2026-11-03T07:00:00.000Z',
    };

    const view = buildNowView([afterMidnightStandup], clock, 'America/Mexico_City');

    expect(view.laterToday).toEqual([]);
  });

  it('leaves an event that has already ended out of later today', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:45:00.000Z') };

    const view = buildNowView([weeklySync], clock, 'America/Mexico_City');

    expect(view.laterToday).toEqual([]);
  });
});
