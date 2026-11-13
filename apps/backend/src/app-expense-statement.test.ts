import { describe, expect, it } from 'vitest';

import { createApp } from './app';

import {
  postJson,
  postTriageRun,
  temporaryDatabasePath,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnsweringByMessageId,
  expenseInvoiceProposal,
  statementVendors,
} from './app.test-support';

describe('backend app: the weekly expense statement', () => {
  it("answers GET /expense-statement?week= with a CSV attachment of the week's expenses, quoting commas and quotes", async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-acme': expenseInvoiceProposal('Acme, Inc.', '2026-11-02', 120),
      'message-tacos': expenseInvoiceProposal('Tacos "El Güero"', '2026-11-03', 85.5),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-acme', threadId: 'thread-acme', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-tacos', threadId: 'thread-tacos', date: 'Tue, 3 Nov 2026 10:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const response = await app.request('/expense-statement?week=2026-11-02');

    const link = (messageId: string) => `https://mail.google.com/mail/?authuser=ana%40example.com#all/${messageId}`;
    expect({
      status: response.status,
      contentType: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
      body: await response.text(),
    }).toEqual({
      status: 200,
      contentType: expect.stringContaining('text/csv') as unknown,
      disposition: expect.stringContaining('attachment') as unknown,
      body: [
        'vendor,amount,currency,date,account,link',
        `"Acme, Inc.",120,MXN,2026-11-02,ana@example.com,${link('message-acme')}`,
        `"Tacos ""El Güero""",85.5,MXN,2026-11-03,ana@example.com,${link('message-tacos')}`,
        '',
      ].join('\n'),
    });
  });

  it('quotes in GET /expense-statement a field containing a line break', async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-acme': expenseInvoiceProposal('Acme\nInc.', '2026-11-02', 120),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-acme', threadId: 'thread-acme', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const response = await app.request('/expense-statement?week=2026-11-02');

    const link = 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-acme';
    expect(await response.text()).toBe(
      [
        'vendor,amount,currency,date,account,link',
        `"Acme\nInc.",120,MXN,2026-11-02,ana@example.com,${link}`,
        '',
      ].join('\n'),
    );
  });

  it('answers GET /expense-statement without week with the current business week', async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-last-week': expenseInvoiceProposal('Last week', '2026-10-30'),
      'message-this-week': expenseInvoiceProposal('This week', '2026-11-03'),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const thursdayInMexicoCity = { now: () => new Date('2026-11-05T18:00:00.000Z') };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: thursdayInMexicoCity, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-last-week', threadId: 'thread-last', date: 'Fri, 30 Oct 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-this-week', threadId: 'thread-this', date: 'Tue, 3 Nov 2026 10:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const response = await app.request('/expense-statement');

    const vendors = await statementVendors(response);
    expect(vendors).toEqual(['This week']);
  });

  it('leaves out of GET /expense-statement an expense proposal the user rejected through POST /verdicts', async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-kept': expenseInvoiceProposal('Kept', '2026-11-02'),
      'message-rejected': expenseInvoiceProposal('Rejected', '2026-11-03'),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-kept', threadId: 'thread-kept', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        {
          ...budgetReview,
          id: 'message-rejected',
          threadId: 'thread-rejected',
          date: 'Tue, 3 Nov 2026 10:00:00 -0600',
        },
      ],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-rejected', decision: 'rejected' });

    const response = await app.request('/expense-statement?week=2026-11-02');

    const vendors = await statementVendors(response);
    expect(vendors).toEqual(['Kept']);
  });

  it("still lists in GET /expense-statement the week's expenses, in message-date order, after a backend restart on the same database file", async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-tuesday': expenseInvoiceProposal('Tuesday', '2026-11-03'),
      'message-monday': expenseInvoiceProposal('Monday', '2026-11-02'),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
    };
    const beforeRestart = createApp(options);
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(beforeRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-tuesday', threadId: 'thread-tuesday', date: 'Tue, 3 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-monday', threadId: 'thread-monday', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
      ],
    });
    await postTriageRun(beforeRestart);
    const afterRestart = createApp(options);

    const response = await afterRestart.request('/expense-statement?week=2026-11-02');

    const vendors = await statementVendors(response);
    expect(vendors).toEqual(['Monday', 'Tuesday']);
  });
});
