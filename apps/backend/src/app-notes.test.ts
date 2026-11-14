import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { getJson, postCalendarSnapshot, postJson, temporaryDatabasePath } from './app.test-support';
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

  it('proposes at GET /triage-queue a notes item assigned to someone else when MY_LIFE_USER_NAMES is unset', async () => {
    const { userNames } = readStartupSettings({}, '/Users/ana');
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath(), userNames });

    await postJson(
      app,
      '/notes-report',
      budgetReviewNotesReport(
        'ana@example.com',
        ['Suggested next steps', '[Tomás Ibarra] Ask the vendor for the new pricing sheet.'].join('\n'),
      ),
    );
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual(['Ask the vendor for the new pricing sheet.']);
  });

  it('lists each notes item once at GET /triage-queue when the same doc is reported again with the same modified time', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    const report = budgetReviewNotesReport('ana@example.com', budgetReviewNotesText);

    await postJson(app, '/notes-report', report);
    await postJson(app, '/notes-report', report);
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual([
      'Send the revised budget to the finance team by Friday.',
      'Ask the vendor for the new pricing sheet.',
    ]);
  });

  it('lists only the items not seen before at GET /triage-queue when the same doc is reported again with a newer modified time', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    const firstReport = budgetReviewNotesReport('ana@example.com', budgetReviewNotesText);
    const editedReport = budgetReviewNotesReport(
      'ana@example.com',
      [budgetReviewNotesText, 'Book the room for the next review.'].join('\n'),
    );
    const editedDoc = { ...editedReport.docs[0]!, modifiedTime: '2026-11-13T09:00:00.000Z' };

    await postJson(app, '/notes-report', firstReport);
    await postJson(app, '/notes-report', { ...editedReport, docs: [editedDoc] });
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual([
      'Send the revised budget to the finance team by Friday.',
      'Ask the vendor for the new pricing sheet.',
      'Book the room for the next review.',
    ]);
  });
  it('still lists at GET /triage-queue a proposed notes item after a backend restart on the same database file', async () => {
    const databasePath = temporaryDatabasePath();
    const beforeRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(beforeRestart, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));
    const afterRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });

    const { notesItems } = await getJson<{ notesItems: unknown[] }>(afterRestart, '/triage-queue');

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
  it('lists at GET /tasks a task titled with the notes item text, linked to the doc, on the doc account, and drops the item from GET /triage-queue once the user picks task on it at POST /notes-verdicts', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postJson(app, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));
    const { notesItems: proposedItems } = await getJson<{ notesItems: { id: string }[] }>(app, '/triage-queue');

    await postJson(app, '/notes-verdicts', { id: proposedItems[0]!.id, decision: 'task' });
    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect({ tasks, remainingItems: notesItems.map((item) => item.text) }).toEqual({
      tasks: [
        expect.objectContaining({
          status: 'open',
          title: 'Send the revised budget to the finance team by Friday.',
          link: 'https://docs.google.com/document/d/doc-1/edit',
          accountEmail: 'ana@example.com',
        }),
      ],
      remainingItems: ['Ask the vendor for the new pricing sheet.'],
    });
  });
  it('lists no task at GET /tasks and drops the item from GET /triage-queue once the user picks ignore on a notes item at POST /notes-verdicts', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postJson(app, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));
    const { notesItems: proposedItems } = await getJson<{ notesItems: { id: string }[] }>(app, '/triage-queue');

    await postJson(app, '/notes-verdicts', { id: proposedItems[0]!.id, decision: 'ignore' });
    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(app, '/triage-queue');

    expect({ tasks, remainingItems: notesItems.map((item) => item.text) }).toEqual({
      tasks: [],
      remainingItems: ['Ask the vendor for the new pricing sheet.'],
    });
  });
  it('still drops from GET /triage-queue a notes item the user ignored at POST /notes-verdicts after a backend restart on the same database file', async () => {
    const databasePath = temporaryDatabasePath();
    const beforeRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(beforeRestart, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));
    const { notesItems: proposedItems } = await getJson<{ notesItems: { id: string }[] }>(
      beforeRestart,
      '/triage-queue',
    );
    await postJson(beforeRestart, '/notes-verdicts', { id: proposedItems[0]!.id, decision: 'ignore' });
    const afterRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });

    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(afterRestart, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual(['Ask the vendor for the new pricing sheet.']);
  });
  it('lists each notes item once at GET /triage-queue when the same doc is reported again, unchanged, after a backend restart on the same database file', async () => {
    const databasePath = temporaryDatabasePath();
    const report = budgetReviewNotesReport('ana@example.com', budgetReviewNotesText);
    const beforeRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(beforeRestart, '/notes-report', report);
    const afterRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });

    await postJson(afterRestart, '/notes-report', report);
    const { notesItems } = await getJson<{ notesItems: { text: string }[] }>(afterRestart, '/triage-queue');

    expect(notesItems.map((item) => item.text)).toEqual([
      'Send the revised budget to the finance team by Friday.',
      'Ask the vendor for the new pricing sheet.',
    ]);
  });
  it('still lists at GET /tasks a task made from a notes item at POST /notes-verdicts after a backend restart on the same database file', async () => {
    const databasePath = temporaryDatabasePath();
    const beforeRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(beforeRestart, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));
    const { notesItems: proposedItems } = await getJson<{ notesItems: { id: string }[] }>(
      beforeRestart,
      '/triage-queue',
    );
    await postJson(beforeRestart, '/notes-verdicts', { id: proposedItems[0]!.id, decision: 'task' });
    const afterRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });

    const { tasks } = await getJson<{ tasks: unknown[] }>(afterRestart, '/tasks');

    expect(tasks).toEqual([
      expect.objectContaining({
        status: 'open',
        title: 'Send the revised budget to the finance team by Friday.',
        link: 'https://docs.google.com/document/d/doc-1/edit',
        accountEmail: 'ana@example.com',
      }),
    ]);
  });
  it('drops from GET /tasks a task made from a notes item once it is marked done at POST /tasks/:id/done', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postJson(app, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));
    const { notesItems: proposedItems } = await getJson<{ notesItems: { id: string }[] }>(app, '/triage-queue');
    await postJson(app, '/notes-verdicts', { id: proposedItems[0]!.id, decision: 'task' });
    const { tasks: openTasks } = await getJson<{ tasks: { id: string }[] }>(app, '/tasks');

    const response = await postJson(app, `/tasks/${openTasks[0]!.id}/done`, {});

    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(response.status).toBe(200);
    expect(tasks).toEqual([]);
  });
  it("shows at GET /triage-queue, on a notes item, the title and start time of the event in that account's stored calendar snapshot that has the notes doc attached", async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postCalendarSnapshot(app, 'ana@example.com', [
      {
        id: 'event-1',
        iCalUID: 'event-1@google.com',
        title: 'Quarterly budget review',
        start: '2026-11-12T17:00:00.000Z',
        end: '2026-11-12T17:45:00.000Z',
        attendees: [],
        attachmentFileIds: ['doc-1'],
      },
    ]);

    await postJson(app, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));

    const { notesItems } = await getJson<{ notesItems: unknown[] }>(app, '/triage-queue');
    expect(notesItems[0]).toEqual(
      expect.objectContaining({
        event: { title: 'Quarterly budget review', start: '2026-11-12T17:00:00.000Z' },
      }),
    );
  });
  it("shows at GET /triage-queue no event on a notes item whose doc is attached to no event in that account's stored calendar snapshot, even when another account's event has the doc attached", async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bruno@example.com'],
      databasePath: temporaryDatabasePath(),
    });
    await postCalendarSnapshot(app, 'ana@example.com', []);
    await postCalendarSnapshot(app, 'bruno@example.com', [
      {
        id: 'event-1',
        iCalUID: 'event-1@google.com',
        title: 'Quarterly budget review',
        start: '2026-11-12T17:00:00.000Z',
        end: '2026-11-12T17:45:00.000Z',
        attendees: [],
        attachmentFileIds: ['doc-1'],
      },
    ]);

    await postJson(app, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));

    const { notesItems } = await getJson<{ notesItems: { event?: unknown }[] }>(app, '/triage-queue');
    expect(notesItems[0]).toEqual(expect.objectContaining({ accountEmail: 'ana@example.com' }));
    expect(notesItems[0]!.event).toBeUndefined();
  });
  it("lists at GET /tasks, on a task made from a notes item at POST /notes-verdicts, the title and start time of the event in that account's stored calendar snapshot that has the notes doc attached", async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postCalendarSnapshot(app, 'ana@example.com', [
      {
        id: 'event-1',
        iCalUID: 'event-1@google.com',
        title: 'Quarterly budget review',
        start: '2026-11-12T17:00:00.000Z',
        end: '2026-11-12T17:45:00.000Z',
        attendees: [],
        attachmentFileIds: ['doc-1'],
      },
    ]);
    await postJson(app, '/notes-report', budgetReviewNotesReport('ana@example.com', budgetReviewNotesText));
    const { notesItems } = await getJson<{ notesItems: { id: string }[] }>(app, '/triage-queue');

    await postJson(app, '/notes-verdicts', { id: notesItems[0]!.id, decision: 'task' });

    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(tasks).toEqual([
      expect.objectContaining({
        title: 'Send the revised budget to the finance team by Friday.',
        event: { title: 'Quarterly budget review', start: '2026-11-12T17:00:00.000Z' },
      }),
    ]);
  });

  it('gives at GET /now one notes source per account, with the time its last notes report was received', async () => {
    let currentTime = new Date('2026-11-12T18:05:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com', 'ana@work.example.com'],
      clock: { now: () => currentTime },
      databasePath: temporaryDatabasePath(),
    });

    await postJson(app, '/notes-report', { accountEmail: 'ana@example.com', docs: [] });
    currentTime = new Date('2026-11-12T18:07:00.000Z');
    await postJson(app, '/notes-report', { accountEmail: 'ana@work.example.com', docs: [] });
    currentTime = new Date('2026-11-12T18:09:00.000Z');
    await postJson(app, '/notes-report', { accountEmail: 'ana@work.example.com', docs: [] });
    const { sources } = await getJson<{ sources: { source: string }[] }>(app, '/now');

    expect(sources.filter(({ source }) => source === 'notes')).toEqual([
      expect.objectContaining({
        email: 'ana@example.com',
        source: 'notes',
        lastReportedAt: '2026-11-12T18:05:00.000Z',
      }),
      expect.objectContaining({
        email: 'ana@work.example.com',
        source: 'notes',
        lastReportedAt: '2026-11-12T18:09:00.000Z',
      }),
    ]);
  });
});
