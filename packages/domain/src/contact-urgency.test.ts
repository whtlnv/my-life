import { describe, expect, it } from 'vitest';

import { contactUrgency } from './contact-urgency';

const urgencySettings = {
  timeZone: 'America/Mexico_City',
  unansweredAskBusinessDays: 2,
  deadlineHours: 48,
  vipWaitingBusinessDays: 1,
};

describe('contactUrgency', () => {
  it('is urgent, with the reason "unanswered ask", when the contact asked the user something 2 business days ago and nobody answered', () => {
    const mondayFivePm = '2026-11-09T23:00:00.000Z';
    const wednesdayFivePm = '2026-11-11T23:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-budget',
        receivedAt: mondayFivePm,
        sentByUser: false,
        asks: [{ ask: 'Review the Q3 budget spreadsheet and send comments' }],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: wednesdayFivePm, settings: urgencySettings })).toEqual({
      urgent: true,
      reasons: ['unanswered ask'],
    });
  });

  it('is not urgent when the contact asked the user something only 1 business day ago and nobody answered', () => {
    const mondayFivePm = '2026-11-09T23:00:00.000Z';
    const tuesdayFivePm = '2026-11-10T23:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-budget',
        receivedAt: mondayFivePm,
        sentByUser: false,
        asks: [{ ask: 'Review the Q3 budget spreadsheet and send comments' }],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: tuesdayFivePm, settings: urgencySettings })).toEqual({
      urgent: false,
      reasons: [],
    });
  });
});
