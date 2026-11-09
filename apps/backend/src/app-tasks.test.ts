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

  it('drops a task marked done at POST /tasks/:id/done from GET /tasks', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});
    const open = await getJson<{ tasks: { id: string }[] }>(app, '/tasks');

    const response = await postJson(app, `/tasks/${open.tasks[0]?.id}/done`, {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(response.status).toBe(200);
    expect(tasks.tasks).toEqual([]);
  });

  it('keeps a task snoozed at POST /tasks/:id/snooze out of GET /tasks until its until time and lists it again after', async () => {
    let now = new Date('2026-11-02T15:10:00.000Z');
    const clock = { now: () => now };
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});
    const open = await getJson<{ tasks: { id: string }[] }>(app, '/tasks');

    await postJson(app, `/tasks/${open.tasks[0]?.id}/snooze`, { until: '2026-11-02T17:00:00.000Z' });

    const whileSnoozed = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    now = new Date('2026-11-02T17:01:00.000Z');
    const afterSnooze = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(whileSnoozed.tasks).toEqual([]);
    expect(afterSnooze.tasks).toEqual([expect.objectContaining({ title: 'Approve the budget', status: 'open' })]);
  });

  it('shows at GET /tasks the person set with PUT /tasks/:id/waiting-on as the task waiting-on person', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});
    const open = await getJson<{ tasks: { id: string }[] }>(app, '/tasks');

    const response = await app.request(`/tasks/${open.tasks[0]?.id}/waiting-on`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ person: 'luis@example.com' }),
    });

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(response.status).toBe(200);
    expect(tasks.tasks).toEqual([
      expect.objectContaining({ title: 'Approve the budget', waitingOn: 'luis@example.com' }),
    ]);
  });

  it('lists at GET /tasks/:id/history the transitions made through the task routes, each with its clock time, oldest first', async () => {
    let now = new Date('2026-11-02T15:10:00.000Z');
    const clock = { now: () => now };
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});
    const open = await getJson<{ tasks: { id: string }[] }>(app, '/tasks');
    const taskId = open.tasks[0]?.id;
    now = new Date('2026-11-02T15:20:00.000Z');
    await postJson(app, `/tasks/${taskId}/snooze`, { until: '2026-11-02T15:25:00.000Z' });
    now = new Date('2026-11-02T15:30:00.000Z');
    await postJson(app, `/tasks/${taskId}/done`, {});

    const response = await app.request(`/tasks/${taskId}/history`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      history: [
        { transition: 'created', at: '2026-11-02T15:10:00.000Z' },
        { transition: 'snoozed', at: '2026-11-02T15:20:00.000Z' },
        { transition: 'done', at: '2026-11-02T15:30:00.000Z' },
      ],
    });
  });

  it('answers 404 at POST /tasks/:id/done for a task id it does not know', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const response = await postJson(app, '/tasks/no-such-task/done', {});

    expect(response.status).toBe(404);
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
