import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import {
  postJson,
  postTriageRun,
  proposeBudgetReview,
  markContact,
  unmarkContact,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
  triageAnsweringByMessageId,
  budgetReviewReportWithSecondMessageFromMarta,
  keepProposalExtracting,
  shopNewsletterArchiveProposal,
  expenseInvoiceProposal,
  profileDirectoryWith,
} from './app.test-support';

const clockOnWednesdayMorning = { now: () => new Date('2026-11-04T17:00:00.000Z') };

describe('backend app: GET /people and GET /waiting-on', () => {
  it('lists at GET /people a contact marked vip through PUT /contacts/:email/marks/vip under VIP and not under Everyone else', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);
    await markContact(app, 'luis@example.com', 'vip');

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
    expect(everyoneElse.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('lists at GET /people under VIP, and not under Everyone else, a contact whose email is on the "Always matters" line of the profile of the account that received its message', async () => {
    const profileDirectory = profileDirectoryWith({
      'example.md': '## People\n\n- Always matters: luis@example.com\n- Never matters: (to fill)\n',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, profileDirectory });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
    expect(everyoneElse.map(({ emails }) => emails)).toEqual([['marta@acme.com']]);
  });

  it('lists at GET /people under Everyone else, and not under VIP, a contact on the "Always matters" line whose vip mark the user removed through DELETE /contacts/:email/marks/vip', async () => {
    const profileDirectory = profileDirectoryWith({
      'example.md': '## People\n\n- Always matters: luis@example.com\n- Never matters: (to fill)\n',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, profileDirectory });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    await unmarkContact(app, 'luis@example.com', 'vip');
    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip).toEqual([]);
    expect(everyoneElse.map(({ emails }) => emails)).toContainEqual(['luis@example.com']);
  });

  it('still answers at GET /people, with no "Always matters" VIPs, when the profile directory has no profile file for the account that received the messages', async () => {
    const profileDirectory = profileDirectoryWith({});
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, profileDirectory });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip).toEqual([]);
    expect(everyoneElse.map(({ emails }) => emails).toSorted()).toEqual([['luis@example.com'], ['marta@acme.com']]);
  });

  it('lists at GET /people under Everyone else the contact whose most recent message is newest first', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const [luisMessage, martaMessage] = budgetReviewReportWithSecondMessageFromMarta.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [luisMessage, { ...martaMessage, date: 'Mon, 2 Nov 2026 09:05:00 -0600' }],
    });

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { everyoneElse } = (await response.json()) as { everyoneElse: { emails: string[] }[] };
    expect(everyoneElse.map(({ emails }) => emails)).toEqual([['marta@acme.com'], ['luis@example.com']]);
  });

  it('leaves out of GET /people a sender whose only message carries a List-Id, and keeps a sender writing in person', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const luisMessage = budgetReviewReport.messages[0];
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        luisMessage,
        {
          ...luisMessage,
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Vendor News <news@vendor.example>',
          subject: 'Weekly digest',
          listId: '<digest.vendor.example>',
        },
      ],
    });

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect([...vip, ...everyoneElse].map(({ emails }) => emails)).toEqual([['luis@example.com']]);
  });

  it('keeps at GET /people a sender who wrote one message in person besides one carrying a List-Id', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const luisMessage = budgetReviewReport.messages[0];
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        luisMessage,
        {
          ...luisMessage,
          id: 'message-2',
          threadId: 'thread-2',
          subject: 'Budget bulletin',
          listId: '<bulletin.example.com>',
        },
      ],
    });

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect([...vip, ...everyoneElse].map(({ emails }) => emails)).toEqual([['luis@example.com']]);
  });

  it('gives each contact at GET /people, under VIP and under Everyone else, its organization and the time of its most recent message', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const [luisMessage, martaMessage] = budgetReviewReportWithSecondMessageFromMarta.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [luisMessage, { ...martaMessage, date: 'Mon, 2 Nov 2026 09:05:00 -0600' }],
    });
    await markContact(app, 'marta@acme.com', 'vip');

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[]; organization: string; lastMessageAt: string }[];
      everyoneElse: { emails: string[]; organization: string; lastMessageAt: string }[];
    };
    expect(vip).toMatchObject([
      { emails: ['marta@acme.com'], organization: 'acme.com', lastMessageAt: '2026-11-02T15:05:00.000Z' },
    ]);
    expect(everyoneElse).toMatchObject([
      { emails: ['luis@example.com'], organization: 'example.com', lastMessageAt: '2026-11-02T15:00:00.000Z' },
    ]);
  });

  it('gives a contact at GET /people the organization name POST /contacts-import brought for its email, not its sender domain', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { everyoneElse } = (await response.json()) as { everyoneElse: { emails: string[]; organization: string }[] };
    expect(everyoneElse).toMatchObject([{ emails: ['luis@example.com'], organization: 'Acme' }]);
  });

  it('gives a contact at GET /people with no stored organization the organization its triaged message’s extraction named, not its sender domain', async () => {
    const triage = triageAnswering(keepProposalExtracting({ organization: 'Mutuus' }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { everyoneElse } = (await response.json()) as { everyoneElse: { emails: string[]; organization: string }[] };
    expect(everyoneElse).toMatchObject([{ emails: ['luis@example.com'], organization: 'Mutuus' }]);
  });

  it('gives a contact at GET /people with no stored organization and a blank organization from its extraction its sender domain', async () => {
    const triage = triageAnswering(keepProposalExtracting({ organization: '' }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { everyoneElse } = (await response.json()) as { everyoneElse: { emails: string[]; organization: string }[] };
    expect(everyoneElse).toMatchObject([{ emails: ['luis@example.com'], organization: 'example.com' }]);
  });

  it('lists at GET /people a non-VIP contact whose triaged message carries a deadline inside 48 hours under Urgent with the reason "deadline", and not under Everyone else', async () => {
    const tomorrowNoon = '2026-11-03T12:00:00-06:00';
    const triage = triageAnswering(keepProposalExtracting({ dates: [tomorrowNoon] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent, everyoneElse } = (await response.json()) as {
      urgent: { emails: string[]; reasons: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['deadline'] })]);
    expect(everyoneElse.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('gives each contact under Urgent at GET /people its organization and the time of its most recent message, alongside its reasons', async () => {
    const tomorrowNoon = '2026-11-03T12:00:00-06:00';
    const triage = triageAnswering(keepProposalExtracting({ dates: [tomorrowNoon] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent } = (await response.json()) as {
      urgent: { emails: string[]; reasons: string[]; organization: string; lastMessageAt: string }[];
    };
    expect(urgent).toMatchObject([
      {
        emails: ['luis@example.com'],
        reasons: ['deadline'],
        organization: 'example.com',
        lastMessageAt: '2026-11-02T15:00:00.000Z',
      },
    ]);
  });

  it('lists at GET /people a non-VIP contact whose triaged message carries a date more than 48 hours away under Everyone else and not under Urgent', async () => {
    const nextWeek = '2026-11-10T12:00:00-06:00';
    const triage = triageAnswering(keepProposalExtracting({ dates: [nextWeek] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent, everyoneElse } = (await response.json()) as {
      urgent: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(everyoneElse.map(({ emails }) => emails)).toContainEqual(['luis@example.com']);
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('lists at GET /people a non-VIP contact whose only extracted deadline has already passed under Everyone else and not under Urgent', async () => {
    const lastSaturdayNoon = '2026-10-31T12:00:00-06:00';
    const triage = triageAnswering(keepProposalExtracting({ dates: [lastSaturdayNoon] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent, everyoneElse } = (await response.json()) as {
      urgent: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(everyoneElse.map(({ emails }) => emails)).toContainEqual(['luis@example.com']);
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('lists at GET /people a VIP contact whose message has waited more than 1 business day for a reply under both VIP and Urgent, with the reason "VIP waiting"', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning });
    await postJson(app, '/mail-report', budgetReviewReport);
    await markContact(app, 'luis@example.com', 'vip');

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, urgent } = (await response.json()) as {
      vip: { emails: string[] }[];
      urgent: { emails: string[]; reasons: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['VIP waiting'] })]);
  });

  it('does not list at GET /people under Urgent a VIP contact whose message the user answered in the thread, nor a VIP contact whose message arrived less than 1 business day ago', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning });
    const luisMondayMessage = budgetReviewReport.messages[0];
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        luisMondayMessage,
        {
          ...luisMondayMessage,
          id: 'message-reply',
          from: 'Ana <ana@example.com>',
          to: 'luis@example.com',
          date: 'Mon, 2 Nov 2026 10:00:00 -0600',
          sentByUser: true,
        },
        {
          ...luisMondayMessage,
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Marta <marta@acme.com>',
          date: 'Wed, 4 Nov 2026 08:00:00 -0600',
        },
      ],
    });
    await markContact(app, 'luis@example.com', 'vip');
    await markContact(app, 'marta@acme.com', 'vip');

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, urgent } = (await response.json()) as {
      vip: { emails: string[] }[];
      urgent: { emails: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual(expect.arrayContaining([['luis@example.com'], ['marta@acme.com']]));
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['marta@acme.com']);
  });

  it('lists at GET /people under Urgent, with the reason "unanswered ask", a non-VIP contact whose ask has waited 2 business days with no reply from the user', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Review the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning, triage });
    await proposeBudgetReview(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent } = (await response.json()) as { urgent: { emails: string[]; reasons: string[] }[] };
    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['unanswered ask'] })]);
  });

  it('lists at GET /waiting-on a contact whose last message the user has not answered, and leaves out a contact whose last message the user answered in the thread', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning });
    const luisMondayMessage = budgetReviewReport.messages[0];
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        luisMondayMessage,
        {
          ...luisMondayMessage,
          id: 'message-reply',
          from: 'Ana <ana@example.com>',
          to: 'luis@example.com',
          date: 'Mon, 2 Nov 2026 10:00:00 -0600',
          sentByUser: true,
        },
        {
          ...luisMondayMessage,
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Marta <marta@acme.com>',
          date: 'Tue, 3 Nov 2026 08:00:00 -0600',
        },
      ],
    });

    const response = await app.request('/waiting-on');

    expect(response.status).toBe(200);
    const { people } = (await response.json()) as { people: { email: string }[] };
    expect(people.map(({ email }) => email)).toEqual(['marta@acme.com']);
  });

  it('gives each person at GET /waiting-on their display name and the time of their oldest message still waiting for a reply', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning });
    const luisMondayMessage = { ...budgetReviewReport.messages[0], from: 'Luis Pérez <luis@example.com>' };
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...luisMondayMessage, id: 'message-2', threadId: 'thread-2', date: 'Tue, 3 Nov 2026 08:00:00 -0600' },
        luisMondayMessage,
      ],
    });

    const response = await app.request('/waiting-on');

    const { people } = (await response.json()) as { people: unknown[] };
    expect(people).toEqual([
      { email: 'luis@example.com', displayName: 'Luis Pérez', waitingSince: '2026-11-02T15:00:00.000Z' },
    ]);
  });

  it('leaves out of GET /waiting-on a sender whose only waiting message carries a List-Id, and keeps a sender writing in person', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning });
    const luisMondayMessage = budgetReviewReport.messages[0];
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        luisMondayMessage,
        {
          ...luisMondayMessage,
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Vendor News <news@vendor.example>',
          subject: 'Weekly digest',
          listId: '<digest.vendor.example>',
        },
      ],
    });

    const response = await app.request('/waiting-on');

    const { people } = (await response.json()) as { people: { email: string }[] };
    expect(people.map(({ email }) => email)).toEqual(['luis@example.com']);
  });

  it('leaves out of GET /waiting-on a sender whose waiting message was proposed in an automated category, and keeps a sender whose message was proposed as an action', async () => {
    const triage = triageAnsweringByMessageId({
      'message-1': {
        action: 'act',
        category: 'action',
        summary: 'Luis asks for a budget review',
        extract: {},
        reason: 'Luis asks the user directly',
      },
      'message-2': shopNewsletterArchiveProposal,
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning, triage });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);
    await postTriageRun(app);

    const response = await app.request('/waiting-on');

    const { people } = (await response.json()) as { people: { email: string }[] };
    expect(people.map(({ email }) => email)).toEqual(['luis@example.com']);
  });

  it('leaves out of GET /waiting-on a sender whose waiting message was proposed as an expense, and keeps a sender whose message was proposed as an action', async () => {
    const triage = triageAnsweringByMessageId({
      'message-1': {
        action: 'act',
        category: 'action',
        summary: 'Luis asks for a budget review',
        extract: {},
        reason: 'Luis asks the user directly',
      },
      'message-2': expenseInvoiceProposal('Acme', '2026-11-02'),
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning, triage });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);
    await postTriageRun(app);

    const response = await app.request('/waiting-on');

    const { people } = (await response.json()) as { people: { email: string }[] };
    expect(people.map(({ email }) => email)).toEqual(['luis@example.com']);
  });
});
