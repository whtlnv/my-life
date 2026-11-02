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
});
