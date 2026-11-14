import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { getJson, postJson, temporaryDatabasePath } from './app.test-support';
import { readStartupSettings } from './startup-settings';

const budgetReviewNotesText = [
  'Quarterly budget review',
  'Notes by Gemini',
  '',
  'Summary',
  'The team reviewed the third-quarter spend.',
  '',
  'Suggested next steps',
  'Send the revised budget to the finance team by Friday.',
  'Ask the vendor for the new pricing sheet.',
].join('\n');

function budgetReviewNotesReport(accountEmail: string, text: string) {
  return {
    accountEmail,
    docs: [
      {
        id: 'doc-1',
        title: 'Quarterly budget review - Notes by Gemini',
        modifiedTime: '2026-11-12T18:00:00.000Z',
        webLink: 'https://docs.google.com/document/d/doc-1/edit',
        text,
      },
    ],
  };
}

describe('createApp meeting notes', () => {
  it('lists at GET /triage-queue, in the meeting notes section, each item parsed from a notes report of an allow-listed account with its text, the doc title as the meeting, the doc link and the account', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });

    const reportResponse = await postJson(
      app,
      '/notes-report',
      budgetReviewNotesReport('ana@example.com', budgetReviewNotesText),
    );
    const { notesItems } = await getJson<{ notesItems: unknown[] }>(app, '/triage-queue');

    expect(reportResponse.status).toBe(200);
    expect(notesItems).toEqual([
      expect.objectContaining({
        text: 'Send the revised budget to the finance team by Friday.',
        meeting: 'Quarterly budget review - Notes by Gemini',
        docLink: 'https://docs.google.com/document/d/doc-1/edit',
        accountEmail: 'ana@example.com',
      }),
      expect.objectContaining({
        text: 'Ask the vendor for the new pricing sheet.',
        meeting: 'Quarterly budget review - Notes by Gemini',
        docLink: 'https://docs.google.com/document/d/doc-1/edit',
        accountEmail: 'ana@example.com',
      }),
    ]);
  });

  it('rejects with 403 a notes report from an account not on the allow-list and lists nothing from it at GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });

    const reportResponse = await postJson(
      app,
      '/notes-report',
      budgetReviewNotesReport('stranger@example.com', budgetReviewNotesText),
    );
    const { notesItems } = await getJson<{ notesItems: unknown[] }>(app, '/triage-queue');

    expect({ status: reportResponse.status, notesItems }).toEqual({ status: 403, notesItems: [] });
  });

  it("proposes at GET /triage-queue, out of a report that also holds another person's item, the notes item assigned to one of the names in userNames", async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      databasePath: temporaryDatabasePath(),
      userNames: ['Ana Ruiz'],
    });

    await postJson(
      app,
      '/notes-report',
      budgetReviewNotesReport(
        'ana@example.com',
        [
          'Suggested next steps',
          '[Ana Ruiz] Send the revised budget to the finance team.',
          '[Tomás Ibarra] Ask the vendor for the new pricing sheet.',
        ].join('\n'),
      ),
    );
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual(['Send the revised budget to the finance team.']);
  });

  it('proposes nothing at GET /triage-queue for a notes item assigned to a name not in userNames', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      databasePath: temporaryDatabasePath(),
      userNames: ['Ana Ruiz'],
    });

    await postJson(
      app,
      '/notes-report',
      budgetReviewNotesReport(
        'ana@example.com',
        ['Suggested next steps', '[Tomás Ibarra] Ask the vendor for the new pricing sheet.'].join('\n'),
      ),
    );
    const { notesItems } = await getJson<{ notesItems: unknown[] }>(app, '/triage-queue');

    expect(notesItems).toEqual([]);
  });

  it("proposes at GET /triage-queue the notes item assigned to the second of several comma-separated names in MY_LIFE_USER_NAMES, and not another person's item", async () => {
    const { userNames } = readStartupSettings({ MY_LIFE_USER_NAMES: 'Ana Ruiz,Ana R.' }, '/Users/ana');
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath(), userNames });

    await postJson(
      app,
      '/notes-report',
      budgetReviewNotesReport(
        'ana@example.com',
        [
          'Suggested next steps',
          '[Ana R.] Send the revised budget to the finance team.',
          '[Tomás Ibarra] Ask the vendor for the new pricing sheet.',
        ].join('\n'),
      ),
    );
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual(['Send the revised budget to the finance team.']);
  });

  it("proposes at GET /triage-queue a notes item that names no assignee when userNames is set, and not another person's item", async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      databasePath: temporaryDatabasePath(),
      userNames: ['Ana Ruiz'],
    });

    await postJson(
      app,
      '/notes-report',
      budgetReviewNotesReport(
        'ana@example.com',
        [
          'Suggested next steps',
          '[Tomás Ibarra] Send the revised budget to the finance team.',
          'Ask the vendor for the new pricing sheet.',
        ].join('\n'),
      ),
    );
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual(['Ask the vendor for the new pricing sheet.']);
  });
});
