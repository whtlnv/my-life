import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import {
  postJson,
  postTriageRun,
  getJson,
  clockAtTenPastThree,
  budgetReviewReport,
  keepProposalExtracting,
  triageAnswering,
  temporaryDatabasePath,
} from './app.test-support';

describe('backend app: task proposals and tasks', () => {
  it('lists at GET /task-proposals each ask extracted from a triaged message with its title, due time, message link and account', async () => {
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget', due: '2026-11-05' }] }),
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const listed = await getJson<{ proposals: unknown[] }>(app, '/task-proposals');

    expect(listed.proposals).toEqual([
      expect.objectContaining({
        title: 'Approve the budget',
        due: '2026-11-05',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        accountEmail: 'ana@example.com',
      }),
    ]);
  });

  it('makes a confirmed task proposal an open task at GET /tasks and stops listing it at GET /task-proposals', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');

    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    const stillWaiting = await getJson<{ proposals: unknown[] }>(app, '/task-proposals');
    expect(tasks.tasks).toEqual([
      expect.objectContaining({
        title: 'Approve the budget',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        accountEmail: 'ana@example.com',
        status: 'open',
      }),
    ]);
    expect(stillWaiting.proposals).toEqual([]);
  });

  it('drops a rejected task proposal from GET /task-proposals without creating a task at GET /tasks', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');

    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/rejection`, {});

    const stillWaiting = await getJson<{ proposals: unknown[] }>(app, '/task-proposals');
    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(stillWaiting.proposals).toEqual([]);
    expect(tasks.tasks).toEqual([]);
  });

  it('keeps a confirmed task proposal an open task, not listed again at GET /task-proposals, after a backend restart on the same database file', async () => {
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath: temporaryDatabasePath() };
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const beforeRestart = createApp({ ...options, triage });
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);
    await postTriageRun(beforeRestart);
    const waiting = await getJson<{ proposals: { id: string }[] }>(beforeRestart, '/task-proposals');
    await postJson(beforeRestart, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});

    const afterRestart = createApp(options);
    const stillWaiting = await getJson<{ proposals: unknown[] }>(afterRestart, '/task-proposals');
    const tasks = await getJson<{ tasks: unknown[] }>(afterRestart, '/tasks');

    expect(stillWaiting.proposals).toEqual([]);
    expect(tasks.tasks).toEqual([expect.objectContaining({ title: 'Approve the budget', status: 'open' })]);
  });
});
