import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  postCalendarSnapshot,
  weeklySync,
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
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
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

  it('keeps after a backend restart on the same database file a done task out of GET /tasks, a snoozed task hidden until its time with its waiting-on person, and each history unchanged', async () => {
    let now = new Date('2026-11-02T15:10:00.000Z');
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: { now: () => now },
      databasePath: temporaryDatabasePath(),
    };
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }, { ask: 'Send the slides' }] }),
    );
    const beforeRestart = createApp({ ...options, triage });
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);
    await postTriageRun(beforeRestart);
    const waiting = await getJson<{ proposals: { id: string; title: string }[] }>(beforeRestart, '/task-proposals');
    for (const proposal of waiting.proposals) {
      await postJson(beforeRestart, `/task-proposals/${proposal.id}/confirmation`, {});
    }
    const open = await getJson<{ tasks: { id: string; title: string }[] }>(beforeRestart, '/tasks');
    const doneTaskId = open.tasks.find(({ title }) => title === 'Approve the budget')?.id;
    const snoozedTaskId = open.tasks.find(({ title }) => title === 'Send the slides')?.id;
    now = new Date('2026-11-02T15:20:00.000Z');
    await postJson(beforeRestart, `/tasks/${doneTaskId}/done`, {});
    await beforeRestart.request(`/tasks/${snoozedTaskId}/waiting-on`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ person: 'luis@example.com' }),
    });
    await postJson(beforeRestart, `/tasks/${snoozedTaskId}/snooze`, { until: '2026-11-02T17:00:00.000Z' });
    const doneHistoryBefore = await getJson<unknown>(beforeRestart, `/tasks/${doneTaskId}/history`);
    const snoozedHistoryBefore = await getJson<unknown>(beforeRestart, `/tasks/${snoozedTaskId}/history`);

    const afterRestart = createApp(options);
    const whileSnoozed = await getJson<{ tasks: unknown[] }>(afterRestart, '/tasks');
    const doneHistoryAfter = await getJson<unknown>(afterRestart, `/tasks/${doneTaskId}/history`);
    const snoozedHistoryAfter = await getJson<unknown>(afterRestart, `/tasks/${snoozedTaskId}/history`);
    now = new Date('2026-11-02T17:01:00.000Z');
    const afterSnooze = await getJson<{ tasks: unknown[] }>(afterRestart, '/tasks');

    expect(whileSnoozed.tasks).toEqual([]);
    expect(afterSnooze.tasks).toEqual([
      expect.objectContaining({ title: 'Send the slides', status: 'open', waitingOn: 'luis@example.com' }),
    ]);
    expect(doneHistoryAfter).toEqual(doneHistoryBefore);
    expect(snoozedHistoryAfter).toEqual(snoozedHistoryBefore);
  });

  it('hands the prioritization port the open tasks at POST /prioritization-run and shows at GET /tasks the rank and reason it returned for each', async () => {
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget', due: '2026-11-05' }] }),
    );
    const handedTasks: unknown[] = [];
    const prioritization = {
      prioritize: async (context: { tasks: { id: string }[] }) => {
        handedTasks.push(...context.tasks);
        return {
          ranks: context.tasks.map(({ id }) => ({ taskId: id, rank: 1, reason: 'Due before the board meeting' })),
          costInUsd: 0.01,
        };
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, prioritization });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});
    const open = await getJson<{ tasks: { id: string }[] }>(app, '/tasks');

    await postJson(app, '/prioritization-run', {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(handedTasks).toEqual([
      {
        id: open.tasks[0]?.id,
        title: 'Approve the budget',
        accountEmail: 'ana@example.com',
        due: '2026-11-05',
      },
    ]);
    expect(tasks.tasks).toEqual([
      expect.objectContaining({ title: 'Approve the budget', rank: 1, reason: 'Due before the board meeting' }),
    ]);
  });

  it('hands the prioritization port at POST /prioritization-run the profile of the account the open tasks come from', async () => {
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    const profileText = '## Purpose\n\nBoard work for Acme; the budget review closes this week.\n';
    writeFileSync(join(profileDirectory, 'example.md'), profileText);
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget', due: '2026-11-05' }] }),
    );
    const handedProfiles: string[] = [];
    const prioritization = {
      prioritize: async (context: { tasks: { id: string }[]; profile: string }) => {
        handedProfiles.push(context.profile);
        return { ranks: [], costInUsd: 0.01 };
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage,
      prioritization,
      profileDirectory,
    });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});

    await postJson(app, '/prioritization-run', {});

    expect(handedProfiles).toEqual([expect.stringContaining(profileText)]);
  });

  it('hands the prioritization port at POST /prioritization-run today\'s calendar events across every account', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const handedCalendars: unknown[][] = [];
    const prioritization = {
      prioritize: async (context: { tasks: { id: string }[]; calendar: unknown[] }) => {
        handedCalendars.push(context.calendar);
        return { ranks: [], costInUsd: 0.01 };
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com', 'francisco@example.com'],
      clock: clockAtTenPastThree,
      triage,
      prioritization,
    });
    const boardMeeting = {
      ...weeklySync,
      id: 'event-2',
      iCalUID: 'event-2@google.com',
      title: 'Board meeting',
      start: '2026-11-02T18:00:00.000Z',
      end: '2026-11-02T19:00:00.000Z',
    };
    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    await postCalendarSnapshot(app, 'francisco@example.com', [boardMeeting]);
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${waiting.proposals[0]?.id}/confirmation`, {});

    await postJson(app, '/prioritization-run', {});

    expect(handedCalendars).toEqual([
      expect.arrayContaining([
        expect.objectContaining({ title: 'Weekly sync', start: '2026-11-02T15:00:00.000Z' }),
        expect.objectContaining({ title: 'Board meeting', start: '2026-11-02T18:00:00.000Z' }),
      ]),
    ]);
  });
});
