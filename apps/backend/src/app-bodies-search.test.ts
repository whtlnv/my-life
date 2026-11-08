import { describe, expect, it } from 'vitest';

import { createApp } from './app';

import {
  postJson,
  postTriageRun,
  getBodiesMissing,
  markContact,
  setContactDetails,
  temporaryDatabasePath,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
  messageWithQuarterlyNumbersBody,
  budgetReviewReportWithQuarterlyNumbersBody,
  searchResultsListingOnlyMessageOne,
  keepProposalExtracting,
  triageUnderV2Recording,
  storeBudgetReviewProposedUnder,
} from './app.test-support';

describe('backend app: message bodies, retriage, triage context and search', () => {
  it('lists at GET /bodies-missing?account= the id of a message reported at POST /mail-report for that account without a body', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);

    const response = await app.request('/bodies-missing?account=ana%40example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messageIds: ['message-1'] });
  });

  it('lists at GET /bodies-missing?account= neither a message of that account reported with a body nor a body-less message of another account', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com', 'bea@example.com'], clock: clockAtTenPastThree });
    const bodyLessMessage = budgetReviewReport.messages[0];
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        bodyLessMessage,
        { ...bodyLessMessage, id: 'message-2', body: 'Can you review the budget by Friday?' },
      ],
    });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      accountEmail: 'bea@example.com',
      messages: [{ ...bodyLessMessage, id: 'message-3', to: 'bea@example.com' }],
    });

    const bodiesMissing = await getBodiesMissing(app, 'ana@example.com');

    expect(bodiesMissing).toEqual({ messageIds: ['message-1'] });
  });

  it('asks the triage port again, with the body, for a message proposed under triage-v1 whose body arrives at POST /bodies-report, on the next POST /triage-run', async () => {
    const databasePath = temporaryDatabasePath();
    await storeBudgetReviewProposedUnder(databasePath, 'triage-v1');
    const askedMessages: { id: string; body?: string | undefined }[] = [];
    const triage = triageUnderV2Recording(askedMessages, ({ id, body }) => ({ id, body }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    const body = 'Hi Ana, can you review the budget by Friday? Luis';

    await postJson(app, '/bodies-report', {
      accountEmail: 'ana@example.com',
      bodies: [{ messageId: 'message-1', body }],
    });
    await postTriageRun(app);

    expect(askedMessages).toEqual([{ id: 'message-1', body }]);
  });

  it('lists at GET /tasks no task when the retriage after its body arrives proposes act for a message whose keep proposal the user had already confirmed', async () => {
    const databasePath = temporaryDatabasePath();
    await storeBudgetReviewProposedUnder(databasePath, 'triage-v1');
    const triage = {
      propose: () =>
        Promise.resolve({
          proposal: {
            action: 'act',
            category: 'action',
            summary: 'Luis asks for a budget review',
            extract: { asker: 'Luis', ask: 'Review the budget' },
            reason: 'Luis asks the user directly',
            taskDraft: { title: 'Review the budget by Friday' },
          },
          costInUsd: 0,
          promptVersion: 'triage-v2',
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });

    await postJson(app, '/bodies-report', {
      accountEmail: 'ana@example.com',
      bodies: [{ messageId: 'message-1', body: 'Hi Ana, can you review the budget by Friday? Luis' }],
    });
    await postTriageRun(app);

    const response = await app.request('/tasks');
    expect(await response.json()).toEqual({ tasks: [] });
  });

  it('does not ask the triage port again for a message already proposed under triage-v2 whose body arrives at POST /bodies-report, on the next POST /triage-run', async () => {
    const databasePath = temporaryDatabasePath();
    await storeBudgetReviewProposedUnder(databasePath, 'triage-v2');
    const askedMessages: { id: string; body?: string | undefined }[] = [];
    const triage = triageUnderV2Recording(askedMessages, ({ id, body }) => ({ id, body }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });

    await postJson(app, '/bodies-report', {
      accountEmail: 'ana@example.com',
      bodies: [{ messageId: 'message-1', body: 'Hi Ana, can you review the budget by Friday? Luis' }],
    });
    await postTriageRun(app);

    expect(askedMessages).toEqual([]);
  });

  it('asks the triage port again, with the body, on the first POST /triage-run after a restart for a message whose body arrived at POST /bodies-report before the restart and was not yet retriaged', async () => {
    const databasePath = temporaryDatabasePath();
    await storeBudgetReviewProposedUnder(databasePath, 'triage-v1');
    const body = 'Hi Ana, can you review the budget by Friday? Luis';
    const beforeRestart = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    await postJson(beforeRestart, '/bodies-report', {
      accountEmail: 'ana@example.com',
      bodies: [{ messageId: 'message-1', body }],
    });
    const askedMessages: { id: string; body?: string | undefined }[] = [];
    const triage = triageUnderV2Recording(askedMessages, ({ id, body }) => ({ id, body }));
    const afterRestart = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage,
    });

    await postTriageRun(afterRestart);

    expect(askedMessages).toEqual([{ id: 'message-1', body }]);
  });

  it("hands the triage port, for a message from a contact the user marked vip and gave an organization, lists and a note, that contact's record with the display name from the From header", async () => {
    const askedMessages: { id: string; contact?: unknown }[] = [];
    const triage = triageUnderV2Recording(askedMessages, ({ id, contact }) => ({ id, contact }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });
    await markContact(app, 'luis@example.com', 'vip');
    await setContactDetails(app, 'luis@example.com', { lists: ['board'], note: 'Prefers calls' });

    await postTriageRun(app);

    expect(askedMessages).toEqual([
      {
        id: 'message-1',
        contact: { displayName: 'Luis', organization: 'Acme', marks: ['vip'], lists: ['board'], note: 'Prefers calls' },
      },
    ]);
  });

  it('hands the triage port no contact record for a message whose sender was never imported, marked or given details', async () => {
    const askedMessages: { id: string; contact?: unknown }[] = [];
    const triage = triageUnderV2Recording(askedMessages, ({ id, contact }) => ({ id, contact }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(askedMessages).toEqual([{ id: 'message-1', contact: undefined }]);
  });

  it("hands the triage port, for a reply in a thread whose earlier message was already triaged, that earlier extraction's thread state", async () => {
    const threadStateAfterFirstMessage = 'Luis asked Ana to review the budget by Friday; Ana has not answered';
    const askedMessages: { id: string; threadState?: unknown }[] = [];
    const triage = {
      propose: (message: { id: string; threadState?: unknown }) => {
        askedMessages.push({ id: message.id, threadState: message.threadState });
        const proposal =
          message.id === 'message-1'
            ? keepProposalExtracting({ threadState: threadStateAfterFirstMessage })
            : keepProposalExtracting();
        return Promise.resolve({ proposal, costInUsd: 0, promptVersion: 'triage-v2' });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, id: 'message-2', subject: 'Re: Budget review', snippet: 'Any news?' }],
    });

    await postTriageRun(app);

    expect(askedMessages.filter(({ id }) => id === 'message-2')).toEqual([
      { id: 'message-2', threadState: threadStateAfterFirstMessage },
    ]);
  });

  it('hands the triage port no thread state for the first message of a thread, even when a later reply in that thread was triaged before it arrived', async () => {
    const askedMessages: { id: string; threadState?: unknown }[] = [];
    const triage = {
      propose: (message: { id: string; threadState?: unknown }) => {
        askedMessages.push({ id: message.id, threadState: message.threadState });
        const proposal =
          message.id === 'message-2'
            ? keepProposalExtracting({ threadState: 'Luis is still waiting for Ana to review the budget' })
            : keepProposalExtracting();
        return Promise.resolve({ proposal, costInUsd: 0, promptVersion: 'triage-v2' });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReview,
          id: 'message-2',
          subject: 'Re: Budget review',
          date: 'Tue, 3 Nov 2026 09:00:00 -0600',
          snippet: 'Any news?',
        },
      ],
    });
    await postTriageRun(app);
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(askedMessages.filter(({ id }) => id === 'message-1')).toEqual([{ id: 'message-1', threadState: undefined }]);
  });

  it('lists at GET /search?q= the message whose body contains the query word', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReportWithQuarterlyNumbersBody);

    const response = await app.request('/search?q=quarterly');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(searchResultsListingOnlyMessageOne);
  });

  it('lists at GET /search?q= no message whose body lacks the query word, even when the word appears inside another word', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        messageWithQuarterlyNumbersBody,
        {
          ...budgetReviewReport.messages[0],
          id: 'message-2',
          threadId: 'thread-2',
          body: 'Hi Ana, the sales team outnumbers us at the headquarters. Luis',
        },
      ],
    });

    const response = await app.request('/search?q=numbers');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(searchResultsListingOnlyMessageOne);
  });

  it('lists at GET /search?q= the message whose summary alone contains the query word', async () => {
    const triage = triageAnswering(keepProposalExtracting({ summary: 'Luis asks for the forecast before Friday' }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReportWithQuarterlyNumbersBody);
    await postTriageRun(app);

    const response = await app.request('/search?q=forecast');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(searchResultsListingOnlyMessageOne);
  });

  it('lists at GET /search?q= a message stored after an earlier search, without a rebuild', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const beforeStoring = await app.request('/search?q=quarterly');
    expect(await beforeStoring.json()).toEqual({ messages: [] });
    await postJson(app, '/mail-report', budgetReviewReportWithQuarterlyNumbersBody);

    const response = await app.request('/search?q=quarterly');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(searchResultsListingOnlyMessageOne);
  });

  it('still lists at GET /search?q= after a backend restart on the same database file a message whose body was reported before it', async () => {
    const databasePath = temporaryDatabasePath();
    const beforeRestart = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    await postJson(beforeRestart, '/mail-report', budgetReviewReportWithQuarterlyNumbersBody);
    const afterRestart = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });

    const response = await afterRestart.request('/search?q=quarterly');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(searchResultsListingOnlyMessageOne);
  });
});
