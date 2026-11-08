import { describe, expect, it } from 'vitest';

import { triageCategories } from '@my-life/contracts';

import { createApp } from './app';

import {
  postJson,
  postTriageRun,
  getCommands,
  postAcknowledgement,
  switchCategory,
  temporaryDatabasePath,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
  ccThreadTriage,
  budgetReviewActTriage,
  proposeBudgetReview,
  confirmBudgetReviewProposal,
} from './app.test-support';

describe('backend app: commands, tasks, check-later and category modes', () => {
  it("lists at GET /commands for the message's account an archive command with an id and the message id once its archive proposal is confirmed", async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);

    const response = await getCommands(app, 'ana@example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it.each([
    {
      rule: 'for an account other than the one whose message was confirmed for archive',
      action: 'archive',
      decide: confirmBudgetReviewProposal,
      accountEmail: 'bea@example.com',
    },
    {
      rule: 'for an archive proposal that has no verdict yet',
      action: 'archive',
      decide: proposeBudgetReview,
      accountEmail: 'ana@example.com',
    },
    {
      rule: 'for a keep proposal the user confirmed',
      action: 'keep',
      decide: confirmBudgetReviewProposal,
      accountEmail: 'ana@example.com',
    },
  ] as const)('lists at GET /commands no archive command $rule', async ({ action, decide, accountEmail }) => {
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bea@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage(action),
    });
    await decide(app);

    const response = await getCommands(app, accountEmail);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands two archive commands with distinct ids, each carrying its own message id, for two confirmed archives on one account', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [budgetReview, { ...budgetReview, id: 'message-2', threadId: 'thread-2' }],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    await postJson(app, '/verdicts', { messageId: 'message-2', decision: 'confirmed' });

    const response = await getCommands(app, 'ana@example.com');

    const { commands } = (await response.json()) as { commands: { id: string; messageId: string }[] };
    expect(commands.map(({ messageId }) => messageId).sort()).toEqual(['message-1', 'message-2']);
    expect(new Set(commands.map(({ id }) => id)).size).toBe(2);
  });

  it('lists at GET /commands no archive command once its confirmed archive proposal is re-decided as rejected through POST /verdicts', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);
    currentTime = new Date('2026-11-02T15:11:00.000Z');

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });

    const response = await getCommands(app, 'ana@example.com');
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands the archive command once its rejected archive proposal is re-decided as confirmed through POST /verdicts', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      triage: ccThreadTriage('archive'),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });
    currentTime = new Date('2026-11-02T15:11:00.000Z');

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });

    const response = await getCommands(app, 'ana@example.com');
    expect(await response.json()).toMatchObject({ commands: [{ id: 'archive-message-1', messageId: 'message-1' }] });
  });

  it('lists at GET /commands no command once the extension acknowledged it through POST /commands/:id/acknowledgement', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);
    const pendingResponse = await getCommands(app, 'ana@example.com');
    const {
      commands: [command],
    } = (await pendingResponse.json()) as { commands: { id: string; messageId: string }[] };

    await postAcknowledgement(app, command?.id ?? '');

    const response = await getCommands(app, 'ana@example.com');
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands no command acknowledged before a backend restart', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage: ccThreadTriage('archive'),
    };
    const beforeRestart = createApp(options);
    await confirmBudgetReviewProposal(beforeRestart);
    const pendingResponse = await getCommands(beforeRestart, 'ana@example.com');
    const {
      commands: [command],
    } = (await pendingResponse.json()) as { commands: { id: string; messageId: string }[] };
    await postAcknowledgement(beforeRestart, command?.id ?? '');

    const afterRestart = createApp(options);
    const response = await getCommands(afterRestart, 'ana@example.com');

    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /tasks the title, Gmail link and account of a task stored when an act proposal is confirmed', async () => {
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await confirmBudgetReviewProposal(app);

    const response = await app.request('/tasks');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tasks: [
        {
          title: 'Review the budget by Friday',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
          accountEmail: 'ana@example.com',
        },
      ],
    });
  });

  it('lists at GET /tasks no task once its confirmed act proposal is re-decided as rejected through POST /verdicts', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => currentTime }, triage });
    await confirmBudgetReviewProposal(app);
    currentTime = new Date('2026-11-02T15:11:00.000Z');

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });

    const response = await app.request('/tasks');
    expect(await response.json()).toEqual({ tasks: [] });
  });

  it('lists at GET /check-later the company, Gmail link and account of a sales proposal the user confirmed to keep', async () => {
    const triage = triageAnswering({
      action: 'keep',
      category: 'sales',
      summary: 'Acme pitches invoice automation',
      extract: { company: 'Acme', solution: 'Invoice automation', problem: 'Manual invoice entry' },
      reason: 'An unsolicited pitch that may be worth a look',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await confirmBudgetReviewProposal(app);

    const response = await app.request('/check-later');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkLater: [
        {
          company: 'Acme',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
          accountEmail: 'ana@example.com',
        },
      ],
    });
  });

  it('includes in the GET /now badge count an action proposal waiting for a verdict', async () => {
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({ badgeCount: 1 });
  });

  it('lists at GET /categories every triage category with mode advise when none has been switched', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const response = await app.request('/categories');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('shows at GET /categories a category switched to automatic through PUT /categories/:category/mode, and every other category still advise', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    await switchCategory(app, 'sales', 'automatic');
    const response = await app.request('/categories');

    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({
        category,
        mode: category === 'sales' ? 'automatic' : 'advise',
      })),
    });
  });

  it('shows at GET /categories a category switched back to advise through PUT /categories/:category/mode after being automatic', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await switchCategory(app, 'sales', 'automatic');
    await switchCategory(app, 'sales', 'advise');
    const response = await app.request('/categories');

    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('answers 400 to PUT /categories/:category/mode with an unknown category or an unknown mode, and GET /categories still shows every category advise', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const unknownCategory = await switchCategory(app, 'newsletters', 'automatic');
    const unknownMode = await switchCategory(app, 'sales', 'sometimes');
    const response = await app.request('/categories');

    expect([unknownCategory.status, unknownMode.status]).toEqual([400, 400]);
    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('still shows at GET /categories a category switched to automatic before a backend restart on the same database file', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp(options);
    await switchCategory(beforeRestart, 'sales', 'automatic');

    const afterRestart = createApp(options);
    const response = await afterRestart.request('/categories');

    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({
        category,
        mode: category === 'sales' ? 'automatic' : 'advise',
      })),
    });
  });

  it('returns every automatic category to advise through POST /categories/kill-switch', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await switchCategory(app, 'sales', 'automatic');
    await switchCategory(app, 'expense', 'automatic');

    const response = await app.request('/categories/kill-switch', { method: 'POST' });
    const categories = await app.request('/categories');

    expect(response.status).toBe(200);
    expect(await categories.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('shows at GET /categories the agreement rate of a category as its confirmed verdicts divided by its proposals, a rejection or a correction counting as not confirmed', async () => {
    const sales = {
      action: 'keep',
      category: 'sales',
      summary: 'Globex pitches a CRM',
      extract: { company: 'Globex', solution: 'A CRM', problem: 'Scattered customer notes' },
      reason: 'A sales pitch',
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: triageAnswering(sales),
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: ['pitch-confirmed', 'pitch-rejected', 'pitch-corrected', 'pitch-undecided'].map((id) => ({
        ...budgetReview,
        id,
        threadId: id,
      })),
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'pitch-confirmed', decision: 'confirmed' });
    await postJson(app, '/verdicts', { messageId: 'pitch-rejected', decision: 'rejected' });
    await postJson(app, '/verdicts', {
      messageId: 'pitch-corrected',
      decision: 'rejected',
      correction: { action: 'archive' },
    });

    const response = await app.request('/categories');

    const { categories } = (await response.json()) as { categories: { category: string }[] };
    expect(categories.find(({ category }) => category === 'sales')).toMatchObject({
      category: 'sales',
      mode: 'advise',
      agreementRate: 0.25,
    });
  });

  it("lists at GET /categories a category's five most recent proposals, newest first, each with its summary, action, account and link", async () => {
    const triage = {
      propose: (message: { subject: string }) =>
        Promise.resolve({
          proposal: {
            action: 'keep',
            category: 'sales',
            summary: `${message.subject} pitches a CRM`,
            extract: { company: message.subject, solution: 'A CRM', problem: 'Scattered customer notes' },
            reason: 'A sales pitch',
          },
          costInUsd: 0,
          promptVersion: 'triage-v1',
        }),
    };
    let now = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => now }, triage });
    const [budgetReview] = budgetReviewReport.messages;
    for (const index of [1, 2, 3, 4, 5, 6]) {
      const id = `pitch-${String(index)}`;
      await postJson(app, '/mail-report', {
        ...budgetReviewReport,
        messages: [{ ...budgetReview, id, threadId: id, subject: `Vendor ${String(index)}` }],
      });
      await postTriageRun(app);
      now = new Date(now.getTime() + 60 * 1000);
    }

    const response = await app.request('/categories');

    const { categories } = (await response.json()) as { categories: { category: string }[] };
    expect(categories.find(({ category }) => category === 'sales')).toMatchObject({
      recentProposals: [6, 5, 4, 3, 2].map((index) => ({
        summary: `Vendor ${String(index)} pitches a CRM`,
        action: 'keep',
        accountEmail: 'ana@example.com',
        link: `https://mail.google.com/mail/?authuser=ana%40example.com#all/pitch-${String(index)}`,
      })),
    });
  });

  it('lists at GET /commands an archive command with no verdict for a new archive proposal in a category switched to automatic', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it('lists at GET /tasks with no verdict the task of a new act proposal in a category switched to automatic', async () => {
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await switchCategory(app, 'action', 'automatic');
    await proposeBudgetReview(app);

    const response = await app.request('/tasks');

    expect(await response.json()).toEqual({
      tasks: [
        {
          title: 'Review the budget by Friday',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
          accountEmail: 'ana@example.com',
        },
      ],
    });
  });

  it('lists neither a command at GET /commands nor a task at GET /tasks for a new keep proposal in a category switched to automatic', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);

    const commands = await getCommands(app, 'ana@example.com');
    const tasks = await app.request('/tasks');

    expect({ commands: await commands.json(), tasks: await tasks.json() }).toEqual({
      commands: { commands: [] },
      tasks: { tasks: [] },
    });
  });

  it('still lists at GET /commands the archive command of an archive proposal made while its category was automatic, after the category is switched back to advise', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);
    await switchCategory(app, 'cc-thread', 'advise');

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it('lists no archive command at GET /commands for an archive proposal made while its category was automatic that the user then rejects at POST /verdicts', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists no archive command at GET /commands for an archive proposal made while its category was advise, after the category is switched to automatic', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await proposeBudgetReview(app);
    await switchCategory(app, 'cc-thread', 'automatic');

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toEqual({ commands: [] });
  });

  it('still lists at GET /commands with no verdict the archive command of a proposal made while its category was automatic, after a backend restart on the same database file', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage: ccThreadTriage('archive'),
    };
    const beforeRestart = createApp(options);
    await switchCategory(beforeRestart, 'cc-thread', 'automatic');
    await proposeBudgetReview(beforeRestart);

    const response = await getCommands(createApp(options), 'ana@example.com');

    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it('lists no archive command at GET /commands for a new archive proposal in a category that was automatic before POST /categories/kill-switch, until it is confirmed', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await app.request('/categories/kill-switch', { method: 'POST' });
    await proposeBudgetReview(app);

    const beforeConfirmation = await getCommands(app, 'ana@example.com');
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    const afterConfirmation = await getCommands(app, 'ana@example.com');

    expect({
      beforeConfirmation: await beforeConfirmation.json(),
      afterConfirmation: await afterConfirmation.json(),
    }).toMatchObject({
      beforeConfirmation: { commands: [] },
      afterConfirmation: { commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }] },
    });
  });

  it('labels at GET /commands an archive command issued automatically my-life/auto and one issued after a confirmation my-life/archived', async () => {
    const automaticApp = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(automaticApp, 'cc-thread', 'automatic');
    await proposeBudgetReview(automaticApp);
    const confirmedApp = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(confirmedApp);

    const automatic = await getCommands(automaticApp, 'ana@example.com');
    const confirmed = await getCommands(confirmedApp, 'ana@example.com');

    expect({ automatic: await automatic.json(), confirmed: await confirmed.json() }).toMatchObject({
      automatic: { commands: [{ messageId: 'message-1', label: 'my-life/auto' }] },
      confirmed: { commands: [{ messageId: 'message-1', label: 'my-life/archived' }] },
    });
  });

  it('keeps out of GET /triage-queue and out of the GET /now badge count an act proposal acted on automatically in a category switched to automatic', async () => {
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await switchCategory(app, 'action', 'automatic');
    await proposeBudgetReview(app);

    const queue = await app.request('/triage-queue');
    const now = await app.request('/now');

    expect({ queue: await queue.json(), now: await now.json() }).toMatchObject({
      queue: { action: [] },
      now: { badgeCount: 0 },
    });
  });
  it('lists at GET /triage-queue, under handled for you, a proposal an automatic category acted on today in the business time zone', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({
      handledForYou: [
        {
          messageId: 'message-1',
          category: 'cc-thread',
          action: 'archive',
          summary: 'Luis shared the budget with the team',
          accountEmail: 'ana@example.com',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        },
      ],
    });
  });
  it('lists at GET /triage-queue nothing under handled for you for a proposal an automatic category acted on before today in the business time zone', async () => {
    let now = clockAtTenPastThree.now();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => now },
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);
    now = new Date('2026-11-03T15:10:00.000Z');

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({ handledForYou: [] });
  });
  it('lists at GET /triage-queue nothing under handled for you for a proposal the user confirmed in advise mode, even after its category is switched to automatic', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);
    await switchCategory(app, 'cc-thread', 'automatic');

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({ handledForYou: [] });
  });
});
