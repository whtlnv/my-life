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

  it('does not count an event already in progress', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T15:10:00.000Z') };

    expect(badgeCount([weeklySync], clock)).toBe(0);
  });

  it('adds the action proposals waiting', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T14:50:00.000Z') };
    const firstActionProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'act',
      category: 'action',
    };
    const secondActionProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'keep',
      category: 'action',
    };

    expect(badgeCount([weeklySync], clock, [firstActionProposal, secondActionProposal], [])).toBe(3);
  });

  it('does not count an action proposal that has a verdict', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T14:50:00.000Z') };
    const decidedActionProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'act',
      category: 'action',
    };
    const waitingActionProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'keep',
      category: 'action',
    };
    const verdict = {
      messageId: 'message-1',
      decision: 'confirmed',
      decidedAt: '2026-11-02T14:40:00.000Z',
    };

    expect(badgeCount([weeklySync], clock, [decidedActionProposal, waitingActionProposal], [verdict])).toBe(2);
  });

  it('does not count a waiting proposal of another category', () => {
    const clock: Clock = { now: () => new Date('2026-11-02T14:50:00.000Z') };
    const actionProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'act',
      category: 'action',
    };
    const salesProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'sales',
    };

    expect(badgeCount([weeklySync], clock, [actionProposal, salesProposal], [])).toBe(2);
  });
});
