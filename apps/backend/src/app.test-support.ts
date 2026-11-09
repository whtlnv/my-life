// Staging helpers and fixtures shared by the createApp route tests (app*.test.ts).

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect } from 'vitest';

import { createApp } from './app';
import { openProposalStore } from './proposal-store';

export type App = ReturnType<typeof createApp>;

export const postJson = (app: App, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const putJson = (app: App, path: string, body: unknown) =>
  app.request(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const postCalendarSnapshot = (app: App, accountEmail: string, events: unknown[]) =>
  postJson(app, '/calendar-snapshot', { accountEmail, events });

export const postRegistration = (app: App, email: string) => postJson(app, '/register', { email });

export const postTriageRun = (app: App) => app.request('/triage-run', { method: 'POST' });

export const getJson = async <T>(app: App, path: string) => (await (await app.request(path)).json()) as T;

export interface ListedContact {
  displayName: string;
  emails: string[];
  messageIds: string[];
  marks?: string[];
  lists?: string[];
  note?: string;
  organization?: string;
}

export const getContacts = (app: App) => getJson<{ contacts: ListedContact[] }>(app, '/contacts');

export const byPrimaryEmail = (left: ListedContact, right: ListedContact) =>
  (left.emails[0] ?? '').localeCompare(right.emails[0] ?? '');

export const getOrganizations = (app: App) =>
  getJson<{ organizations: { name: string; messageIds: string[] }[] }>(app, '/organizations');

export const getBodiesMissing = (app: App, account: string) =>
  getJson<{ messageIds: string[] }>(app, `/bodies-missing?account=${encodeURIComponent(account)}`);

export const markContact = (app: App, email: string, mark: string) =>
  app.request(`/contacts/${encodeURIComponent(email)}/marks/${mark}`, { method: 'PUT' });

export const unmarkContact = (app: App, email: string, mark: string) =>
  app.request(`/contacts/${encodeURIComponent(email)}/marks/${mark}`, { method: 'DELETE' });

export const setContactDetails = (app: App, email: string, details: Record<string, unknown>) =>
  app.request(`/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(details),
  });

export const getCommands = (app: App, accountEmail: string) =>
  app.request(`/commands?accountEmail=${encodeURIComponent(accountEmail)}`);

export const firstPendingFilterProposalId = async (app: App) => {
  const { proposals } = (await (await app.request('/filter-proposals')).json()) as { proposals: { id?: string }[] };
  return proposals[0]?.id ?? '';
};

export const approveFilterProposal = (app: App, proposalId: string) =>
  app.request(`/filter-proposals/${proposalId}/approval`, { method: 'POST' });

export const postAcknowledgement = (app: App, commandId: string) =>
  app.request(`/commands/${commandId}/acknowledgement`, { method: 'POST' });

export const acknowledgeFilterCreation = (app: App, proposalId: string, gmailFilterId: string) =>
  app.request(`/commands/create-filter-${proposalId}/acknowledgement`, {
    method: 'POST',
    body: JSON.stringify({ gmailFilterId }),
  });

export const switchCategory = (app: App, category: string, mode: string) =>
  app.request(`/categories/${category}/mode`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });

export const temporaryDatabasePath = () => join(mkdtempSync(join(tmpdir(), 'my-life-')), 'my-life.sqlite');

export const clockAtTenPastThree = { now: () => new Date('2026-11-02T15:10:00.000Z') };

export const budgetReviewReport = {
  accountEmail: 'ana@example.com',
  historyId: '1001',
  messages: [
    {
      id: 'message-1',
      threadId: 'thread-1',
      from: 'Luis <luis@example.com>',
      to: 'ana@example.com',
      subject: 'Budget review',
      date: 'Mon, 2 Nov 2026 09:00:00 -0600',
      snippet: 'Can you review the budget by Friday?',
    },
  ],
};

export const weeklySync = {
  id: 'event-1',
  iCalUID: 'event-1@google.com',
  title: 'Weekly sync',
  start: '2026-11-02T15:00:00.000Z',
  end: '2026-11-02T15:30:00.000Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'luis@example.com', displayName: 'Luis' }],
};

export const triageAnswering = (proposal: unknown) => ({
  propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }),
});

export const triageAnsweringInOrder = (proposalsInOrder: unknown[], costInUsd: number) => ({
  propose: () => Promise.resolve({ proposal: proposalsInOrder.shift(), costInUsd, promptVersion: 'triage-v1' }),
});

export const reportShopNewsletter = (app: App, messageId: string, subject = 'This week at the shop') =>
  postJson(app, '/mail-report', {
    accountEmail: 'ana@example.com',
    historyId: '1001',
    messages: [
      {
        id: messageId,
        threadId: messageId,
        from: 'Shop <news@shop.example.com>',
        to: 'ana@example.com',
        subject,
        date: 'Mon, 2 Nov 2026 09:00:00 -0600',
        snippet: 'New arrivals',
      },
    ],
  });

export const reportTriageAndConfirmShopNewsletters = async (
  app: App,
  messageIds = ['newsletter-1', 'newsletter-2', 'newsletter-3'],
): Promise<void> => {
  for (const messageId of messageIds) {
    await reportShopNewsletter(app, messageId);
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId, decision: 'confirmed' });
  }
};

export const triageRecordingAskedMessageIds = (askedMessageIds: string[], costInUsd = 0) => ({
  propose: (message: { id: string }) => {
    askedMessageIds.push(message.id);
    return Promise.resolve({
      proposal: {
        action: 'keep',
        category: 'unknown',
        summary: 'A message',
        extract: {},
        reason: 'Not sure what it is',
      },
      costInUsd,
      promptVersion: 'triage-v1',
    });
  },
});

export const triageRecordingExamplesByMessageId = (examplesByMessageId: Map<string, unknown[] | undefined>) => ({
  propose: (message: { id: string }, examples?: unknown[]) => {
    examplesByMessageId.set(message.id, examples);
    return Promise.resolve({
      proposal: {
        action: 'archive',
        category: 'cc-thread',
        summary: 'Luis shared the budget with the team',
        extract: { sinceLastMessage: 'Luis shared the budget' },
        reason: 'The user is only copied',
      },
      costInUsd: 0,
      promptVersion: 'triage-v1',
    });
  },
});

export const triageAnsweringByMessageId = (proposalByMessageId: Record<string, unknown>) => ({
  propose: (message: { id: string }) =>
    Promise.resolve({ proposal: proposalByMessageId[message.id], costInUsd: 0, promptVersion: 'triage-v1' }),
});

export const messageWithQuarterlyNumbersBody = {
  ...budgetReviewReport.messages[0],
  body: 'Hi Ana, the quarterly numbers are attached. Luis',
};

export const budgetReviewReportWithQuarterlyNumbersBody = {
  ...budgetReviewReport,
  messages: [messageWithQuarterlyNumbersBody],
};

export const searchResultsListingOnlyMessageOne = { messages: [expect.objectContaining({ id: 'message-1' })] };

export const budgetReviewReportWithSecondMessageFromMarta = {
  ...budgetReviewReport,
  messages: [
    budgetReviewReport.messages[0],
    { ...budgetReviewReport.messages[0], id: 'message-2', threadId: 'thread-2', from: 'Marta <marta@acme.com>' },
  ],
};

// Luis's budget review as `message-received`, and a message Ana sent him as `message-sent`.
export const budgetReviewReportWithReceivedAndSentMessage = {
  ...budgetReviewReport,
  messages: [
    { ...budgetReviewReport.messages[0], id: 'message-received', sentByUser: false },
    {
      ...budgetReviewReport.messages[0],
      id: 'message-sent',
      from: 'Ana <ana@example.com>',
      to: 'luis@example.com',
      sentByUser: true,
    },
  ],
};

export const keepProposalExtracting = (extraction: Record<string, unknown> = {}) => ({
  action: 'keep',
  category: 'unknown',
  summary: 'A budget review',
  extract: {},
  reason: 'Unsure',
  ...extraction,
});

export const triageUnderV2Recording = <Asked>(
  askedMessages: Asked[],
  record: (message: { id: string; body?: string; contact?: unknown }) => Asked,
) => ({
  propose: (message: { id: string; body?: string; contact?: unknown }) => {
    askedMessages.push(record(message));
    return Promise.resolve({ proposal: keepProposalExtracting(), costInUsd: 0, promptVersion: 'triage-v2' });
  },
});

export const storeBudgetReviewProposedUnder = async (databasePath: string, promptVersion: string): Promise<void> => {
  const beforeBackfill = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
  await postJson(beforeBackfill, '/mail-report', budgetReviewReport);
  openProposalStore(databasePath).save({
    messageId: 'message-1',
    madeAt: '2026-11-02T15:00:00.000Z',
    promptVersion,
    proposal: keepProposalExtracting(),
  });
};

export const filterAnswering = (proposal: unknown) => ({
  propose: () => Promise.resolve({ proposal, costInUsd: 0.05, promptVersion: 'filter-v1' }),
});

export const filterRecordingAskedCandidates = (askedCandidates: unknown[], proposal: unknown, costInUsd = 0.05) => ({
  propose: (candidate: unknown) => {
    askedCandidates.push(candidate);
    return Promise.resolve({ proposal, costInUsd, promptVersion: 'filter-v1' });
  },
});

export const ccThreadTriage = (action: 'archive' | 'keep') => {
  const proposal = {
    action,
    category: 'cc-thread',
    summary: 'Luis shared the budget with the team',
    extract: { sinceLastMessage: 'Luis shared the budget' },
    reason: 'The user is only copied',
  };
  return triageAnswering(proposal);
};

export const budgetReviewActTriage = (taskDraft?: { title: string }) =>
  triageAnswering({
    action: 'act',
    category: 'action',
    summary: 'Luis asks for a budget review',
    extract: { asker: 'Luis', ask: 'Review the budget' },
    reason: 'Luis asks the user directly',
    ...(taskDraft && { taskDraft }),
  });

export const shopNewsletterArchiveProposal = {
  action: 'archive',
  category: 'sales',
  summary: 'A shop newsletter',
  extract: {},
  reason: 'Promotional mail',
};

export const shopNewsletterArchiveTriage = () => triageAnswering(shopNewsletterArchiveProposal);

export const shopNewslettersFilterProposal = {
  criteria: { from: 'news@shop.example.com' },
  labelName: 'Shop newsletters',
  skipInbox: true,
};

export const expenseInvoiceProposal = (vendor: string, date: string, amount = 100) => ({
  action: 'archive',
  category: 'expense',
  summary: `Invoice from ${vendor}`,
  extract: { vendor, amount, currency: 'MXN', date },
  reason: 'An invoice to file',
});

export const proposeBudgetReview = async (app: App) => {
  await postJson(app, '/mail-report', budgetReviewReport);
  await postTriageRun(app);
};

export const confirmBudgetReviewProposal = async (app: App) => {
  await proposeBudgetReview(app);
  await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
};

export const statementVendors = async (response: Response) =>
  (await response.text())
    .split('\n')
    .slice(1)
    .filter((row) => row !== '')
    .map((row) => row.split(',')[0]);

export const appServingDashboardAsset = (fileName: string, content: string) => {
  const dashboardDirectory = mkdtempSync(join(tmpdir(), 'my-life-dashboard-'));
  mkdirSync(join(dashboardDirectory, 'assets'));
  writeFileSync(join(dashboardDirectory, 'assets', fileName), content);
  return createApp({ allowedEmails: [], dashboardDirectory });
};
