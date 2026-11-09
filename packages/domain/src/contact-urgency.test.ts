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

  it('is not urgent when the user answered the ask in the same thread, however old the ask', () => {
    const mondayFivePm = '2026-11-09T23:00:00.000Z';
    const tuesdayNineAm = '2026-11-10T15:00:00.000Z';
    const threeWeeksLater = '2026-11-30T23:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-budget',
        receivedAt: mondayFivePm,
        sentByUser: false,
        asks: [{ ask: 'Review the Q3 budget spreadsheet and send comments' }],
      },
      {
        threadId: 'thread-budget',
        receivedAt: tuesdayNineAm,
        sentByUser: true,
        asks: [],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: threeWeeksLater, settings: urgencySettings })).toEqual({
      urgent: false,
      reasons: [],
    });
  });

  it('is urgent, with the reason "deadline", when a message from the contact carries an extracted deadline inside the next 48 hours', () => {
    const mondayNineAm = '2026-11-09T15:00:00.000Z';
    const mondayTenAm = '2026-11-09T16:00:00.000Z';
    const tuesdayNoon = '2026-11-10T18:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-contract',
        receivedAt: mondayNineAm,
        sentByUser: false,
        asks: [{ ask: 'Sign the renewal contract' }],
        dates: [tuesdayNoon],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: mondayTenAm, settings: urgencySettings })).toEqual({
      urgent: true,
      reasons: ['deadline'],
    });
  });

  it('is urgent, with the reason "deadline", on the evening of a date-only deadline for that day in the business time zone', () => {
    const mondayNineAm = '2026-11-09T15:00:00.000Z';
    const mondaySevenPmInMexicoCity = '2026-11-10T01:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-contract',
        receivedAt: mondayNineAm,
        sentByUser: false,
        asks: [{ ask: 'Sign the renewal contract' }],
        dates: ['2026-11-09'],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: mondaySevenPmInMexicoCity, settings: urgencySettings })).toEqual(
      { urgent: true, reasons: ['deadline'] },
    );
  });

  it('is not urgent when a message from the contact carries an extracted deadline more than 48 hours away', () => {
    const mondayNineAm = '2026-11-09T15:00:00.000Z';
    const mondayTenAm = '2026-11-09T16:00:00.000Z';
    const thursdayNoon = '2026-11-12T18:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-contract',
        receivedAt: mondayNineAm,
        sentByUser: false,
        asks: [{ ask: 'Sign the renewal contract' }],
        dates: [thursdayNoon],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: mondayTenAm, settings: urgencySettings })).toEqual({
      urgent: false,
      reasons: [],
    });
  });

  it('is urgent, with the reason "VIP waiting", when a VIP contact\'s message has waited a business day for a reply', () => {
    const mondayFivePm = '2026-11-09T23:00:00.000Z';
    const tuesdayFivePm = '2026-11-10T23:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-lunch',
        receivedAt: mondayFivePm,
        sentByUser: false,
        asks: [],
      },
    ];

    expect(contactUrgency({ messages, vip: true, now: tuesdayFivePm, settings: urgencySettings })).toEqual({
      urgent: true,
      reasons: ['VIP waiting'],
    });
  });

  it("is not urgent when a non-VIP contact's message that asks nothing has waited several business days for a reply", () => {
    const mondayFivePm = '2026-11-09T23:00:00.000Z';
    const thursdayFivePm = '2026-11-12T23:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-lunch',
        receivedAt: mondayFivePm,
        sentByUser: false,
        asks: [],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: thursdayFivePm, settings: urgencySettings })).toEqual({
      urgent: false,
      reasons: [],
    });
  });
});
