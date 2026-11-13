import type { TaskRanks } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import {
  type App,
  postJson,
  putJson,
  proposeBudgetReview,
  confirmBudgetReviewProposal,
  getJson,
  clockAtTenPastThree,
  keepProposalExtracting,
  triageAnswering,
  temporaryDatabasePath,
  postCalendarSnapshot,
  weeklySync,
  profileDirectoryWith,
} from './app.test-support';
import { openSpendStore } from './spend-store';

const confirmFirstTaskProposal = async (app: App) => {
  const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
  await postJson(app, `/task-proposals/${String(waiting.proposals[0]?.id)}/confirmation`, {});
};

const firstOpenTaskId = async (app: App) => {
  const open = await getJson<{ tasks: { id: string }[] }>(app, '/tasks');
  return String(open.tasks[0]?.id);
};

const prioritizationRankingByTitle = (ranksByTitle: Record<string, { rank: number; reason: string }>) => ({
  prioritize: (context: { tasks: { id: string; title: string }[] }) =>
    Promise.resolve({
      ranks: context.tasks.flatMap(({ id, title }) => {
        const ranked = ranksByTitle[title];
        return ranked === undefined ? [] : [{ taskId: id, ...ranked }];
      }),
      costInUsd: 0.01,
    }),
});

const confirmEveryTaskProposal = async (app: App) => {
  const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
  for (const proposal of waiting.proposals) {
    await postJson(app, `/task-proposals/${proposal.id}/confirmation`, {});
  }
};

describe('backend app: task proposals and tasks', () => {
  it('lists at GET /task-proposals each ask extracted from a triaged message with its title, due time, message link and account', async () => {
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget', due: '2026-11-05' }] }),
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

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
    await proposeBudgetReview(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');

    await postJson(app, `/task-proposals/${String(waiting.proposals[0]?.id)}/confirmation`, {});

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
    await proposeBudgetReview(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');

    await postJson(app, `/task-proposals/${String(waiting.proposals[0]?.id)}/rejection`, {});

    const stillWaiting = await getJson<{ proposals: unknown[] }>(app, '/task-proposals');
    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(stillWaiting.proposals).toEqual([]);
    expect(tasks.tasks).toEqual([]);
  });

  it.each(['confirmation', 'rejection'])(
    'answers 404 to a task proposal %s for an unknown id, and creates no task',
    async (decision) => {
      const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

      const response = await postJson(app, `/task-proposals/no-such-proposal/${decision}`, {});

      const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
      expect(response.status).toBe(404);
      expect(tasks.tasks).toEqual([]);
    },
  );

  it('answers POST /prioritization-run without ranking anything when no prioritization port is configured', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);
    const waiting = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    await postJson(app, `/task-proposals/${String(waiting.proposals[0]?.id)}/confirmation`, {});

    const response = await app.request('/prioritization-run', { method: 'POST' });

    const tasks = await getJson<{ tasks: { rank?: number }[] }>(app, '/tasks');
    expect(response.status).toBe(200);
    expect(tasks.tasks).toEqual([expect.not.objectContaining({ rank: expect.anything() as unknown })]);
  });

  it('drops a task marked done at POST /tasks/:id/done from GET /tasks', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    const taskId = await firstOpenTaskId(app);

    const response = await postJson(app, `/tasks/${taskId}/done`, {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(response.status).toBe(200);
    expect(tasks.tasks).toEqual([]);
  });

  it('keeps a task snoozed at POST /tasks/:id/snooze out of GET /tasks until its until time and lists it again after', async () => {
    let now = new Date('2026-11-02T15:10:00.000Z');
    const clock = { now: () => now };
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock, triage });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    const taskId = await firstOpenTaskId(app);

    await postJson(app, `/tasks/${taskId}/snooze`, { until: '2026-11-02T17:00:00.000Z' });

    const whileSnoozed = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    now = new Date('2026-11-02T17:01:00.000Z');
    const afterSnooze = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(whileSnoozed.tasks).toEqual([]);
    expect(afterSnooze.tasks).toEqual([expect.objectContaining({ title: 'Approve the budget', status: 'open' })]);
  });

  it('shows at GET /tasks the person set with PUT /tasks/:id/waiting-on as the task waiting-on person', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    const taskId = await firstOpenTaskId(app);

    const response = await putJson(app, `/tasks/${taskId}/waiting-on`, {
      person: 'luis@example.com',
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
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    const taskId = await firstOpenTaskId(app);
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
    await proposeBudgetReview(beforeRestart);
    await confirmFirstTaskProposal(beforeRestart);

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
    await proposeBudgetReview(beforeRestart);
    await confirmEveryTaskProposal(beforeRestart);
    const open = await getJson<{ tasks: { id: string; title: string }[] }>(beforeRestart, '/tasks');
    const doneTaskId = open.tasks.find(({ title }) => title === 'Approve the budget')?.id;
    const snoozedTaskId = open.tasks.find(({ title }) => title === 'Send the slides')?.id;
    now = new Date('2026-11-02T15:20:00.000Z');
    await postJson(beforeRestart, `/tasks/${String(doneTaskId)}/done`, {});
    await putJson(beforeRestart, `/tasks/${String(snoozedTaskId)}/waiting-on`, { person: 'luis@example.com' });
    await postJson(beforeRestart, `/tasks/${String(snoozedTaskId)}/snooze`, { until: '2026-11-02T17:00:00.000Z' });
    const doneHistoryBefore = await getJson<unknown>(beforeRestart, `/tasks/${String(doneTaskId)}/history`);
    const snoozedHistoryBefore = await getJson<unknown>(beforeRestart, `/tasks/${String(snoozedTaskId)}/history`);

    const afterRestart = createApp(options);
    const whileSnoozed = await getJson<{ tasks: unknown[] }>(afterRestart, '/tasks');
    const doneHistoryAfter = await getJson<unknown>(afterRestart, `/tasks/${String(doneTaskId)}/history`);
    const snoozedHistoryAfter = await getJson<unknown>(afterRestart, `/tasks/${String(snoozedTaskId)}/history`);
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
      prioritize: (context: { tasks: { id: string }[] }) => {
        handedTasks.push(...context.tasks);
        return Promise.resolve({
          ranks: context.tasks.map(({ id }) => ({ taskId: id, rank: 1, reason: 'Due before the board meeting' })),
          costInUsd: 0.01,
        });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, prioritization });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    const taskId = await firstOpenTaskId(app);

    await postJson(app, '/prioritization-run', {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(handedTasks).toEqual([
      {
        id: taskId,
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
    const profileText = '## Purpose\n\nBoard work for Acme; the budget review closes this week.\n';
    const profileDirectory = profileDirectoryWith({ 'example.md': profileText });
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget', due: '2026-11-05' }] }),
    );
    const handedProfiles: string[] = [];
    const prioritization = {
      prioritize: (context: { tasks: { id: string }[]; profile: string }) => {
        handedProfiles.push(context.profile);
        return Promise.resolve({ ranks: [], costInUsd: 0.01 });
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage,
      prioritization,
      profileDirectory,
    });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);

    await postJson(app, '/prioritization-run', {});

    expect(handedProfiles).toEqual([expect.stringContaining(profileText)]);
  });

  it("hands the prioritization port at POST /prioritization-run today's calendar events across every account", async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const handedCalendars: unknown[][] = [];
    const prioritization = {
      prioritize: (context: { tasks: { id: string }[]; calendar: unknown[] }) => {
        handedCalendars.push(context.calendar);
        return Promise.resolve({ ranks: [], costInUsd: 0.01 });
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
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);

    await postJson(app, '/prioritization-run', {});

    expect(handedCalendars).toEqual([
      expect.arrayContaining([
        expect.objectContaining({ title: 'Weekly sync', start: '2026-11-02T15:00:00.000Z' }),
        expect.objectContaining({ title: 'Board meeting', start: '2026-11-02T18:00:00.000Z' }),
      ]),
    ]);
  });

  it('hands the prioritization port at POST /prioritization-run the urgent contacts with their reasons, the same ones GET /people lists as urgent', async () => {
    const tomorrowNoon = '2026-11-03T12:00:00-06:00';
    const triage = triageAnswering(
      keepProposalExtracting({ dates: [tomorrowNoon], asks: [{ ask: 'Approve the budget' }] }),
    );
    const handedUrgentContacts: unknown[][] = [];
    const prioritization = {
      prioritize: (context: { tasks: { id: string }[]; urgentContacts: unknown[] }) => {
        handedUrgentContacts.push(context.urgentContacts);
        return Promise.resolve({ ranks: [], costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, prioritization });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    const people = await getJson<{ urgent: { emails: string[]; reasons: string[] }[] }>(app, '/people');

    await postJson(app, '/prioritization-run', {});

    expect(people.urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['deadline'] })]);
    expect(handedUrgentContacts).toEqual([people.urgent]);
  });

  it('lists at GET /tasks the open tasks ordered by the rank the last prioritization run stored, each with its reason', async () => {
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }, { ask: 'Send the slides' }] }),
    );
    const prioritization = prioritizationRankingByTitle({
      'Send the slides': { rank: 1, reason: 'The board meets at four' },
      'Approve the budget': { rank: 2, reason: 'Due at the end of the week' },
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, prioritization });
    await proposeBudgetReview(app);
    await confirmEveryTaskProposal(app);

    await postJson(app, '/prioritization-run', {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(tasks.tasks).toEqual([
      expect.objectContaining({ title: 'Send the slides', rank: 1, reason: 'The board meets at four' }),
      expect.objectContaining({ title: 'Approve the budget', rank: 2, reason: 'Due at the end of the week' }),
    ]);
  });

  it('ranks at POST /prioritization-run a task confirmed from a mail proposal and lists it at GET /tasks in its rank order with its reason', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
      taskDraft: { title: 'Review the budget by Friday' },
      asks: [{ ask: 'Send the slides' }],
    });
    const prioritization = prioritizationRankingByTitle({
      'Send the slides': { rank: 1, reason: 'The board meets at four' },
      'Review the budget by Friday': { rank: 2, reason: 'Due at the end of the week' },
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, prioritization });
    await confirmBudgetReviewProposal(app);
    await confirmEveryTaskProposal(app);

    await postJson(app, '/prioritization-run', {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(tasks.tasks).toEqual([
      expect.objectContaining({ title: 'Send the slides', rank: 1, reason: 'The board meets at four' }),
      expect.objectContaining({ title: 'Review the budget by Friday', rank: 2, reason: 'Due at the end of the week' }),
    ]);
  });

  it('lists at GET /tasks a task pinned with PUT /tasks/:id/pin first whatever its rank, and back in rank order once unpinned', async () => {
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }, { ask: 'Send the slides' }] }),
    );
    const prioritization = prioritizationRankingByTitle({
      'Send the slides': { rank: 1, reason: 'The board meets at four' },
      'Approve the budget': { rank: 2, reason: 'Due at the end of the week' },
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, prioritization });
    await proposeBudgetReview(app);
    await confirmEveryTaskProposal(app);
    await postJson(app, '/prioritization-run', {});
    const ranked = await getJson<{ tasks: { id: string; title: string }[] }>(app, '/tasks');
    const budgetTask = ranked.tasks.find(({ title }) => title === 'Approve the budget');
    const putPin = (pinned: boolean) => putJson(app, `/tasks/${String(budgetTask?.id)}/pin`, { pinned });

    const pinResponse = await putPin(true);
    const whilePinned = await getJson<{ tasks: { title: string }[] }>(app, '/tasks');
    await putPin(false);
    const afterUnpin = await getJson<{ tasks: { title: string }[] }>(app, '/tasks');

    expect(pinResponse.status).toBe(200);
    expect(whilePinned.tasks.map(({ title }) => title)).toEqual(['Approve the budget', 'Send the slides']);
    expect(afterUnpin.tasks.map(({ title }) => title)).toEqual(['Send the slides', 'Approve the budget']);
  });

  it('keeps at GET /tasks, after a backend restart on the same database file, each task rank, reason and pin from before it, with no prioritization run after it', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const triage = triageAnswering(
      keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }, { ask: 'Send the slides' }] }),
    );
    const prioritization = prioritizationRankingByTitle({
      'Send the slides': { rank: 1, reason: 'The board meets at four' },
      'Approve the budget': { rank: 2, reason: 'Due at the end of the week' },
    });
    const beforeRestart = createApp({ ...options, triage, prioritization });
    await proposeBudgetReview(beforeRestart);
    await confirmEveryTaskProposal(beforeRestart);
    await postJson(beforeRestart, '/prioritization-run', {});
    const ranked = await getJson<{ tasks: { id: string; title: string }[] }>(beforeRestart, '/tasks');
    const budgetTask = ranked.tasks.find(({ title }) => title === 'Approve the budget');
    await putJson(beforeRestart, `/tasks/${String(budgetTask?.id)}/pin`, { pinned: true });

    const afterRestart = createApp(options);
    const tasks = await getJson<{ tasks: unknown[] }>(afterRestart, '/tasks');

    expect(tasks.tasks).toEqual([
      expect.objectContaining({ title: 'Approve the budget', rank: 2, reason: 'Due at the end of the week' }),
      expect.objectContaining({ title: 'Send the slides', rank: 1, reason: 'The board meets at four' }),
    ]);
  });

  it('keeps at GET /tasks the previous ranks and reasons when a prioritization answer fails validation at POST /prioritization-run', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const answers = [
      (taskId: string) => ({ ranks: [{ taskId, rank: 1, reason: 'Due before the board meeting' }], costInUsd: 0.01 }),
      (taskId: string) => ({ ranks: [{ taskId, rank: 'first' }], costInUsd: 0.01 }),
    ];
    const prioritization = {
      prioritize: (context: { tasks: { id: string }[] }) =>
        Promise.resolve(answers.shift()?.(context.tasks[0]?.id ?? '') as unknown as { ranks: TaskRanks['ranks'] }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, prioritization });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    await postJson(app, '/prioritization-run', {});

    await postJson(app, '/prioritization-run', {});

    const tasks = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(tasks.tasks).toEqual([
      expect.objectContaining({ title: 'Approve the budget', rank: 1, reason: 'Due before the board meeting' }),
    ]);
  });

  it('logs the cost of each prioritization call at POST /prioritization-run against the daily spend, with the prioritization model', async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    const prioritization = {
      prioritize: () => Promise.resolve({ ranks: [], costInUsd: 0.4, model: 'claude-opus-5-5' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage,
      prioritization,
    });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);

    await postJson(app, '/prioritization-run', {});

    expect(openSpendStore(databasePath).loadAll()).toContainEqual({
      spentAt: '2026-11-02T15:10:00.000Z',
      model: 'claude-opus-5-5',
      costInUsd: 0.4,
    });
  });

  it("makes no prioritization call at POST /prioritization-run once today's spend reaches the daily ceiling", async () => {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget' }] }));
    let prioritizationCalls = 0;
    const prioritization = {
      prioritize: () => {
        prioritizationCalls += 1;
        return Promise.resolve({ ranks: [], costInUsd: 19, model: 'claude-opus-5-5' });
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      triage,
      prioritization,
    });
    await proposeBudgetReview(app);
    await confirmFirstTaskProposal(app);
    await postJson(app, '/prioritization-run', {});

    await postJson(app, '/prioritization-run', {});

    expect(prioritizationCalls).toBe(1);
  });
  it('makes a prioritization call at POST /prioritization-run again once the configured prioritization interval has elapsed since the last call, and none before', async () => {
    let prioritizationCalls = 0;
    const prioritization = {
      prioritize: () => {
        prioritizationCalls += 1;
        return Promise.resolve({ ranks: [] });
      },
    };
    let now = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => now },
      prioritizationIntervalInMilliseconds: 60 * 60 * 1000,
      prioritization,
    });
    await postJson(app, '/prioritization-run', {});
    now = new Date('2026-11-02T16:09:59.000Z');
    await postJson(app, '/prioritization-run', {});
    const callsBeforeTheInterval = prioritizationCalls;
    now = new Date('2026-11-02T16:10:00.000Z');

    await postJson(app, '/prioritization-run', {});

    expect(callsBeforeTheInterval).toBe(1);
    expect(prioritizationCalls).toBe(2);
  });

  async function badgeCountsAroundConfirmingATaskDue(due: string) {
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Approve the budget', due }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);
    const before = await getJson<{ badgeCount: number }>(app, '/now');

    await confirmFirstTaskProposal(app);

    const after = await getJson<{ badgeCount: number }>(app, '/now');
    return { before: before.badgeCount, after: after.badgeCount };
  }

  it('counts an open task whose due time has passed in the GET /now badge count', async () => {
    const { before, after } = await badgeCountsAroundConfirmingATaskDue('2026-11-01');

    expect(after).toBe(before + 1);
  });

  it('leaves an open task due later out of the GET /now badge count', async () => {
    const { before, after } = await badgeCountsAroundConfirmingATaskDue('2026-11-20');

    expect(after).toBe(before);
  });

  it('counts in the GET /now badge count an open task due at a time written with an offset once that instant has passed, though its local time reads later than the clock', async () => {
    const { before, after } = await badgeCountsAroundConfirmingATaskDue('2026-11-02T16:00:00+02:00');

    expect(after).toBe(before + 1);
  });

  it('leaves out of the GET /now badge count an open task due at a time written with an offset before that instant, though its local time reads earlier than the clock', async () => {
    const { before, after } = await badgeCountsAroundConfirmingATaskDue('2026-11-02T10:00:00-06:00');

    expect(after).toBe(before);
  });
});
