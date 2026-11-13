import { describe, expect, it } from 'vitest';

import { createApp, currentTriagePromptVersion } from './app';
import { createClaudeTriage } from './claude-triage';
import { openDatabase } from './open-database';
import { openProposalStore } from './proposal-store';
import { openReportedMessageStore } from './reported-message-store';
import { openSpendStore } from './spend-store';
import { openVerdictStore } from './verdict-store';

import {
  postJson,
  postTriageRun,
  temporaryDatabasePath,
  clockAtTenPastThree,
  budgetReviewReport,
  budgetReviewReportWithReceivedAndSentMessage,
  triageAnswering,
  triageAnsweringInOrder,
  triageRecordingAskedMessageIds,
  triageRecordingExamplesByMessageId,
  budgetReviewActTriage,
  proposeBudgetReview,
  confirmBudgetReviewProposal,
  promptFile,
} from './app.test-support';

describe('backend app: mail reports, triage runs, the triage queue and verdicts', () => {
  it.each([
    {
      rule: 'accepts a mail report from an allow-listed account at POST /mail-report and counts its message as remaining',
      report: budgetReviewReport,
      status: 200,
      remaining: 1,
    },
    {
      rule: 'refuses a mail report from an account outside the allow-list and counts none of its messages as remaining',
      report: {
        accountEmail: 'stranger@example.com',
        historyId: '1001',
        messages: [
          {
            id: 'message-9',
            threadId: 'thread-9',
            from: 'Luis <luis@example.com>',
            to: 'stranger@example.com',
            subject: 'Intruder mail',
            date: 'Mon, 2 Nov 2026 09:00:00 -0600',
            snippet: 'This should never reach the queue.',
          },
        ],
      },
      status: 403,
      remaining: 0,
    },
    {
      rule: 'refuses a mail report that fails the shared contract with a client error and counts none of its messages as remaining',
      report: {
        accountEmail: 'ana@example.com',
        historyId: '1001',
        messages: [
          {
            threadId: 'thread-3',
            from: 'Luis <luis@example.com>',
            to: 'ana@example.com',
            subject: 'No id',
            date: 'Mon, 2 Nov 2026 09:00:00 -0600',
            snippet: 'This message has no id.',
          },
        ],
      },
      status: 400,
      remaining: 0,
    },
  ])('$rule in GET /triage-queue', async ({ report, status, remaining }) => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const posted = await postJson(app, '/mail-report', report);
    const queue = await app.request('/triage-queue');

    expect(posted.status).toBe(status);
    expect(queue.status).toBe(200);
    expect(await queue.json()).toMatchObject({ remaining });
  });

  it('accepts at POST /mail-report a message with no subject and counts it as remaining in GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });
    const messageWithNoSubject = {
      id: 'message-4',
      threadId: 'thread-4',
      from: 'Luis <luis@example.com>',
      to: 'ana@example.com',
      date: 'Mon, 2 Nov 2026 09:00:00 -0600',
      snippet: 'This message has no subject.',
    };

    const posted = await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [messageWithNoSubject] });
    const queue = await app.request('/triage-queue');

    expect(posted.status).toBe(200);
    expect(await queue.json()).toMatchObject({ remaining: 1 });
  });

  it('accepts at POST /mail-report a message with no To header and counts it as remaining in GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });
    const messageWithNoTo = {
      id: 'message-5',
      threadId: 'thread-5',
      from: 'Luis <luis@example.com>',
      subject: 'Undisclosed recipients',
      date: 'Mon, 2 Nov 2026 09:00:00 -0600',
      snippet: 'This message has no To header.',
    };

    const posted = await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [messageWithNoTo] });
    const queue = await app.request('/triage-queue');

    expect(posted.status).toBe(200);
    expect(await queue.json()).toMatchObject({ remaining: 1 });
  });

  it('says when GET /triage-queue was fetched, from the clock', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({ fetchedAt: '2026-11-02T15:10:00.000Z' });
  });

  it('counts a message reported twice at POST /mail-report once in GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    await postJson(app, '/mail-report', budgetReviewReport);
    const second = await postJson(app, '/mail-report', budgetReviewReport);
    const queue = await app.request('/triage-queue');

    expect(second.status).toBe(200);
    expect(await queue.json()).toMatchObject({ remaining: 1 });
  });

  it('still counts in GET /triage-queue a message reported before a backend restart, and once when it is reported again after it', async () => {
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], databasePath };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);

    const afterRestart = createApp(options);
    const queueAfterRestart = await afterRestart.request('/triage-queue');
    await postJson(afterRestart, '/mail-report', budgetReviewReport);
    const queueAfterReportedAgain = await afterRestart.request('/triage-queue');

    expect(await queueAfterRestart.json()).toMatchObject({ remaining: 1 });
    expect(await queueAfterReportedAgain.json()).toMatchObject({ remaining: 1 });
  });

  it('keeps for each message reported at POST /mail-report whether the user sent it, read back from the same database file after a backend restart', async () => {
    const databasePath = temporaryDatabasePath();
    const beforeRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(beforeRestart, '/mail-report', budgetReviewReportWithReceivedAndSentMessage);

    const afterRestart = openReportedMessageStore(databasePath);

    expect(afterRestart.loadReportedMessages()).toMatchObject([
      { id: 'message-received', sentByUser: false },
      { id: 'message-sent', sentByUser: true },
    ]);
  });

  it("shows in GET /now when an account's mail source last reported, at the time its mail report was received", async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => currentTime } });

    await postJson(app, '/mail-report', budgetReviewReport);
    currentTime = new Date('2026-11-02T15:10:30.000Z');
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({
      sources: [{ email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: false }],
    });
  });

  it('marks the mail source stale in GET /now by the Gmail polling interval the app was created with: with 30 seconds, a report received 70 seconds ago is stale', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      gmailPollingIntervalInMilliseconds: 30 * 1000,
    });

    await postJson(app, '/mail-report', budgetReviewReport);
    currentTime = new Date('2026-11-02T15:11:10.000Z');
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({
      sources: [{ email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: true }],
    });
  });

  it("still shows in GET /now when an account's mail source last reported, after a backend restart on the same database file", async () => {
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);

    const afterRestart = createApp(options);
    const now = await afterRestart.request('/now');

    expect(await now.json()).toMatchObject({
      sources: [{ email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: false }],
    });
  });

  it('asks triage at POST /triage-run for a proposal on each reported message that has none, newest first', async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });

    const run = await postTriageRun(app);

    expect(run.status).toBe(200);
    expect(askedMessageIds).toEqual(['message-newest', 'message-middle', 'message-older']);
  });

  it('never hands triage at POST /triage-run a message the user sent', async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReportWithReceivedAndSentMessage);

    await postTriageRun(app);

    expect(askedMessageIds).toEqual(['message-received']);
  });

  it('does not count in GET /triage-queue remaining a message the user sent, which is never triaged', async () => {
    const triage = triageRecordingAskedMessageIds([]);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReportWithReceivedAndSentMessage);
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({ remaining: 0 });
  });

  it('leaves every reported message untriaged and logs no spend at POST /triage-run when no triage port is configured', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);

    const run = await postTriageRun(app);
    const queue = await app.request('/triage-queue');

    expect(run.status).toBe(200);
    expect(await queue.json()).toMatchObject({ action: [], groups: [], remaining: 1, paused: false });
  });

  it('hands triage at POST /triage-run each message with the email of the account that reported it', async () => {
    const askedMessages: unknown[] = [];
    const triage = {
      propose: (message: unknown) => {
        askedMessages.push(message);
        return Promise.resolve({ proposal: undefined, costInUsd: 0, promptVersion: 'triage-v1' });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, to: 'team@example.com', cc: 'ana@example.com' }],
    });

    await postTriageRun(app);

    expect(askedMessages).toEqual([
      expect.objectContaining({ id: 'message-1', cc: 'ana@example.com', accountEmail: 'ana@example.com' }),
    ]);
  });

  it('hands triage at POST /triage-run the verdict on an earlier message from the same sender as an example', async () => {
    const examplesAskedWith: unknown[] = [];
    const proposal = {
      action: 'archive',
      category: 'cc-thread',
      summary: 'Luis shared the budget with the team',
      extract: { sinceLastMessage: 'Luis shared the budget' },
      reason: 'The user is only copied',
    };
    const triage = {
      propose: (_message: unknown, examples?: unknown[]) => {
        examplesAskedWith.push(examples);
        return Promise.resolve({ proposal, costInUsd: 0, promptVersion: 'triage-v1' });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await confirmBudgetReviewProposal(app);
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, id: 'message-2', threadId: 'thread-2', subject: 'Budget follow-up' }],
    });

    await postTriageRun(app);

    expect(examplesAskedWith[1]).toEqual([
      expect.objectContaining({ messageId: 'message-1', decision: 'confirmed', category: 'cc-thread' }),
    ]);
  });

  it('hands triage at POST /triage-run the verdict on an earlier message from the same sender domain as an example when the sender has no verdicts', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await confirmBudgetReviewProposal(app);
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-2', threadId: 'thread-2', from: 'Marta <marta@example.com>', subject: 'Q4' },
      ],
    });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-2')).toEqual([
      expect.objectContaining({ messageId: 'message-1', decision: 'confirmed' }),
    ]);
  });

  it('does not hand triage at POST /triage-run the verdict on a same-domain message from another List-Id as an example', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, listId: '<finance.example.com>' }],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReview,
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Marta <marta@example.com>',
          subject: 'Weekly newsletter',
          listId: '<newsletter.example.com>',
        },
      ],
    });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-2')).toEqual([]);
  });

  it('hands triage at POST /triage-run the same-sender verdicts as examples newest first, as the domain chooses them', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
    let now = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => now }, triage });
    const [budgetReview] = budgetReviewReport.messages;
    const fromLuis = (id: string, subject: string) => ({ ...budgetReview, id, threadId: `thread-${id}`, subject });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [fromLuis('message-1', 'Budget review'), fromLuis('message-2', 'Budget draft')],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    now = new Date('2026-11-02T15:20:00.000Z');
    await postJson(app, '/verdicts', { messageId: 'message-2', decision: 'confirmed' });
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [fromLuis('message-3', 'Budget final')] });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-3')).toEqual([
      expect.objectContaining({ messageId: 'message-2' }),
      expect.objectContaining({ messageId: 'message-1' }),
    ]);
  });

  it('hands triage at POST /triage-run only the newest eight of ten same-sender verdicts as examples', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
    let now = new Date('2026-11-02T15:00:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => now }, triage });
    const [budgetReview] = budgetReviewReport.messages;
    const fromLuis = (id: string) => ({ ...budgetReview, id, threadId: `thread-${id}`, subject: `Budget ${id}` });
    const earlierIds = Array.from({ length: 10 }, (_, index) => `message-${String(index + 1)}`);
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: earlierIds.map(fromLuis) });
    await postTriageRun(app);
    for (const [index, messageId] of earlierIds.entries()) {
      now = new Date(Date.parse('2026-11-02T15:00:00.000Z') + (index + 1) * 60_000);
      await postJson(app, '/verdicts', { messageId, decision: 'confirmed' });
    }
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [fromLuis('message-11')] });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-11')).toEqual(
      earlierIds
        .slice(2)
        .reverse()
        .map((messageId) => expect.objectContaining({ messageId }) as unknown),
    );
  });

  it('does not ask triage again at POST /triage-run for a message that already has a proposal', async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [{ ...budgetReview, id: 'message-once' }] });
    await postTriageRun(app);

    const secondRun = await postTriageRun(app);

    expect(secondRun.status).toBe(200);
    expect(askedMessageIds).toEqual(['message-once']);
  });

  it("stops asking triage at POST /triage-run once today's spend reaches the daily ceiling", async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });

    const run = await postTriageRun(app);

    expect(run.status).toBe(200);
    expect(askedMessageIds).toEqual(['message-newest', 'message-middle']);
  });

  it('stores each proposal made at POST /triage-run with the time it was made and the prompt version that made it', async () => {
    const proposal = {
      action: 'keep',
      category: 'unknown',
      summary: 'A message',
      extract: {},
      reason: 'Not sure what it is',
    };
    const triage = {
      propose: () => Promise.resolve({ proposal, costInUsd: 0.05, promptVersion: 'triage-v1' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(openProposalStore(databasePath).loadAll()).toEqual([
      { messageId: 'message-1', madeAt: '2026-11-02T15:10:00.000Z', promptVersion: 'triage-v1', proposal },
    ]);
  });

  it('logs the spend of each triage call made at POST /triage-run with its time, model and cost', async () => {
    const triage = {
      propose: () =>
        Promise.resolve({ proposal: {}, costInUsd: 0.05, model: 'claude-opus-5-5', promptVersion: 'triage-v1' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(openSpendStore(databasePath).loadAll()).toEqual([
      { spentAt: '2026-11-02T15:10:00.000Z', model: 'claude-opus-5-5', costInUsd: 0.05 },
    ]);
  });

  it('logs each triage spend at POST /triage-run with the triage model configured for the Claude adapter, not an empty string', async () => {
    const promptPath = promptFile('Classify this email and answer by calling propose_triage.', 'triage-v1.md');
    const triage = createClaudeTriage({
      model: 'claude-model-from-settings',
      promptPath,
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () => Promise.resolve({ content: [], usage: { input_tokens: 0, output_tokens: 0 } }),
    });
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(
      openSpendStore(databasePath)
        .loadAll()
        .map((spend) => spend.model),
    ).toEqual(['claude-model-from-settings']);
  });
  it("neither triages again after a backend restart a message proposed before it, nor forgets the spend logged before it toward today's ceiling", async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
    const databasePath = temporaryDatabasePath();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      databasePath,
      triage,
    };
    const [budgetReview] = budgetReviewReport.messages;
    const newest = { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', { ...budgetReviewReport, messages: [newest] });
    await postTriageRun(beforeRestart);
    askedMessageIds.length = 0;
    const afterRestart = createApp(options);
    await postJson(afterRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        newest,
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });

    await postTriageRun(afterRestart);

    expect(askedMessageIds).toEqual(['message-middle']);
  });
  it("counts toward today's ceiling after a backend restart only the spend logged today in America/Mexico_City, not yesterday's", async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 10);
    const databasePath = temporaryDatabasePath();
    const spendBeforeRestart = openSpendStore(databasePath);
    // 05:00Z on Nov 2 is still 23:00 on Nov 1 in Mexico City: yesterday for a clock at 15:10Z on Nov 2.
    spendBeforeRestart.save({ spentAt: '2026-11-02T05:00:00.000Z', model: 'claude-opus-5-5', costInUsd: 15 });
    spendBeforeRestart.save({ spentAt: '2026-11-02T14:00:00.000Z', model: 'claude-opus-5-5', costInUsd: 10 });
    const afterRestart = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      databasePath,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(afterRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
      ],
    });

    await postTriageRun(afterRestart);

    expect(askedMessageIds).toEqual(['message-newest']);
  });

  it('resumes triage at POST /triage-run and reports GET /triage-queue unpaused once the running backend passes business midnight after reaching the ceiling', async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      dailySpendCeilingInUsd: 20,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);
    // 07:00Z on Nov 3 is 01:00 on Nov 3 in Mexico City: the next business day.
    currentTime = new Date('2026-11-03T07:00:00.000Z');

    await postTriageRun(app);
    const queue = await app.request('/triage-queue');

    expect(askedMessageIds).toEqual(['message-newest', 'message-middle', 'message-older']);
    expect(await queue.json()).toMatchObject({ paused: false });
  });

  it('keeps triage paused at POST /triage-run and GET /triage-queue later the same business day after reaching the ceiling, even once the UTC date has changed', async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
    // 23:30Z on Nov 2 is 17:30 on Nov 2 in Mexico City.
    let currentTime = new Date('2026-11-02T23:30:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      dailySpendCeilingInUsd: 20,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);
    // 01:00Z on Nov 3 is 19:00 on Nov 2 in Mexico City: still the same business day.
    currentTime = new Date('2026-11-03T01:00:00.000Z');

    await postTriageRun(app);
    const queue = await app.request('/triage-queue');

    expect(askedMessageIds).toEqual(['message-newest', 'message-middle']);
    expect(await queue.json()).toMatchObject({ paused: true });
  });

  it('answers GET /triage-queue with the action block, the groups with their counts, the number of messages remaining and whether the ceiling paused triage', async () => {
    const proposalsInOrder = [
      {
        action: 'act',
        category: 'action',
        summary: 'Luis asks for a budget review',
        extract: { asker: 'Luis', ask: 'Review the budget' },
        reason: 'Luis asks the user directly',
      },
      {
        action: 'archive',
        category: 'expense',
        summary: 'Receipt from Acme',
        extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
        reason: 'A receipt to file',
      },
    ];
    const triage = triageAnsweringInOrder(proposalsInOrder, 12);
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    expect(queue.status).toBe(200);
    expect(await queue.json()).toMatchObject({
      action: [{ messageId: 'message-newest' }],
      groups: [{ category: 'expense', count: 1 }],
      remaining: 1,
      paused: true,
    });
  });

  it('puts in the action block of GET /triage-queue the unknown proposals next to the action ones, with no unknown group', async () => {
    const proposalsInOrder = [
      {
        action: 'act',
        category: 'action',
        summary: 'Luis asks for a budget review',
        extract: { asker: 'Luis', ask: 'Review the budget' },
        reason: 'Luis asks the user directly',
      },
      {
        action: 'keep',
        category: 'unknown',
        summary: 'A message that fits no category',
        extract: {},
        reason: 'Nothing in it matches a known category',
      },
    ];
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-action', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-unknown', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { action, groups } = (await queue.json()) as {
      action: { messageId: string }[];
      groups: { category: string }[];
    };
    expect(action.map(({ messageId }) => messageId).sort()).toEqual(['message-action', 'message-unknown']);
    expect(groups.map(({ category }) => category)).not.toContain('unknown');
  });

  it('carries in each GET /triage-queue group its items, each with its account and Gmail link, and puts a system-update proposal in a digest instead', async () => {
    const expenseProposal = {
      action: 'archive',
      category: 'expense',
      summary: 'Receipt from Acme',
      extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
      reason: 'A receipt to file',
    };
    const systemUpdateProposal = {
      action: 'archive',
      category: 'system-update',
      summary: 'GitHub build passed',
      extract: { system: 'GitHub', severity: 'info', significant: false },
      reason: 'A routine notification',
    };
    const proposalsInOrder = [expenseProposal, systemUpdateProposal];
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-expense', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-system', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { groups, digests } = (await queue.json()) as { groups: { category: string }[]; digests: unknown[] };
    const expenseItem = {
      messageId: 'message-expense',
      category: 'expense',
      summary: expenseProposal.summary,
      extract: expenseProposal.extract,
      reason: expenseProposal.reason,
      accountEmail: 'ana@example.com',
      link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-expense',
    };
    expect(groups.find(({ category }) => category === 'expense')).toMatchObject({ items: [expenseItem] });
    expect(digests).toEqual([expect.objectContaining({ category: 'system-update', key: 'GitHub', count: 1 })]);
  });

  it('lists in GET /triage-queue groups no waiting system-update, sales or calendar-drive proposal, which come back in digests only, while an expense proposal stays in its group', async () => {
    const proposalsInOrder = [
      { action: 'archive', category: 'expense', summary: 'Receipt from Acme', reason: 'A receipt to file' },
      { action: 'archive', category: 'system-update', summary: 'GitHub build passed', reason: 'A notification' },
      { action: 'archive', category: 'sales', summary: 'Acme offers a discount', reason: 'A sales pitch' },
      { action: 'archive', category: 'calendar-drive', summary: 'Marta shared a document', reason: 'A share' },
    ].map((proposal, index) => ({
      ...proposal,
      extract: [
        { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
        { system: 'GitHub', severity: 'low', significant: false },
        { company: 'Acme' },
        { item: 'Q4 plan', change: 'shared' },
      ][index],
    }));
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: proposalsInOrder.map((_, index) => ({
        ...budgetReview,
        id: `message-${String(index)}`,
        date: `Mon, 2 Nov 2026 1${String(9 - index)}:00:00 -0600`,
      })),
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { groups, digests } = (await queue.json()) as {
      groups: { category: string; count: number }[];
      digests: { category: string }[];
    };
    expect(groups).toEqual([expect.objectContaining({ category: 'expense', count: 1 })]);
    expect(digests.map(({ category }) => category).sort()).toEqual(['calendar-drive', 'sales', 'system-update']);
  });

  it.each([
    {
      rule: 'groups under cc-thread, not in the action block, an action proposal for a message whose to and cc do not contain the reporting account',
      addressing: { to: 'team@example.com', cc: 'pedro@example.com' },
      expected: { action: [], ccThread: ['message-1'] },
    },
    {
      rule: 'groups under cc-thread an action proposal for a message where the reporting account is only in cc, not in to',
      addressing: { to: 'team@example.com', cc: 'ana@example.com' },
      expected: { action: [], ccThread: ['message-1'] },
    },
    {
      rule: 'keeps in the action block an action proposal for a message whose To header names the reporting account with a display name and different letter case',
      addressing: { to: 'Ana López <Ana@Example.com>' },
      expected: { action: ['message-1'], ccThread: [] },
    },
  ])('$rule in GET /triage-queue', async ({ addressing, expected }) => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks for a review',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, ...addressing }],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { action, groups } = (await queue.json()) as {
      action: { messageId: string }[];
      groups: { category: string; items: { messageId: string }[] }[];
    };
    expect({
      action: action.map(({ messageId }) => messageId),
      ccThread: groups.find(({ category }) => category === 'cc-thread')?.items.map(({ messageId }) => messageId) ?? [],
    }).toEqual(expected);
  });

  it('still groups in GET /triage-queue under cc-thread, after a backend restart on the same database file, an action proposal for a message whose to and cc do not contain the reporting account', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks the team for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks for a review',
    });
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(beforeRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, to: 'team@example.com', cc: 'pedro@example.com' }],
    });
    await postTriageRun(beforeRestart);

    const afterRestart = createApp(options);
    const queue = await afterRestart.request('/triage-queue');

    const { action, groups } = (await queue.json()) as {
      action: { messageId: string }[];
      groups: { category: string; items: { messageId: string }[] }[];
    };
    expect(action).toEqual([]);
    expect(groups.find(({ category }) => category === 'cc-thread')).toMatchObject({
      items: [{ messageId: 'message-1' }],
    });
  });

  it('says in GET /triage-queue which account each item came from and links to the message in Gmail for that account', async () => {
    const triage = budgetReviewActTriage();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({
      action: [
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        },
      ],
    });
  });

  it('keeps in GET /triage-queue the account email, action, category, summary and extract of a proposal made before a backend restart on the same database file', async () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = triageAnswering(proposal);
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    await proposeBudgetReview(beforeRestart);

    const afterRestart = createApp(options);
    const queue = await afterRestart.request('/triage-queue');

    expect(await queue.json()).toMatchObject({
      action: [
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for a budget review',
          extract: { asker: 'Luis', ask: 'Review the budget' },
        },
      ],
    });
  });

  it('shows in GET /triage-queue the action, summary and extract of a proposal made in the current run, without a restart', async () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = triageAnswering(proposal);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({
      action: [
        {
          messageId: 'message-1',
          action: 'act',
          summary: 'Luis asks for a budget review',
          extract: { asker: 'Luis', ask: 'Review the budget' },
        },
      ],
    });
  });

  it('stores a verdict posted at POST /verdicts for a waiting proposal with the time it was decided, and the item leaves GET /triage-queue', async () => {
    const triage = budgetReviewActTriage();
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await proposeBudgetReview(app);

    const response = await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });

    expect(response.status).toBe(200);
    expect(openVerdictStore(databasePath).loadAll()).toEqual([
      { messageId: 'message-1', decision: 'confirmed', decidedAt: '2026-11-02T15:10:00.000Z' },
    ]);
    const queue = await app.request('/triage-queue');
    expect(await queue.json()).toMatchObject({ action: [] });
  });

  it('refuses a verdict posted at POST /verdicts for a message that has no proposal as not found, and stores nothing', async () => {
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });

    const response = await postJson(app, '/verdicts', { messageId: 'unknown-message', decision: 'confirmed' });

    expect(response.status).toBe(404);
    expect(openVerdictStore(databasePath).loadAll()).toEqual([]);
  });

  it('stores the correction of a rejection posted at POST /verdicts together with the verdict', async () => {
    const proposal = {
      action: 'keep',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = triageAnswering(proposal);
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await proposeBudgetReview(app);
    const correction = { action: 'act', taskDraft: { title: 'Review the budget for Luis' } };

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected', correction });

    expect(openVerdictStore(databasePath).loadAll()).toEqual([
      { messageId: 'message-1', decision: 'rejected', correction, decidedAt: '2026-11-02T15:10:00.000Z' },
    ]);
  });

  it('keeps out of GET /triage-queue after a backend restart on the same database file an item whose verdict was posted before it', async () => {
    const triage = budgetReviewActTriage();
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    await confirmBudgetReviewProposal(beforeRestart);

    const afterRestart = createApp(options);
    const queue = await afterRestart.request('/triage-queue');

    expect(await queue.json()).toMatchObject({ action: [], groups: [] });
  });
  it('stores one confirm verdict for every item of a group confirmed whole at POST /group-verdicts, and none for items outside it', async () => {
    const expense = {
      action: 'archive',
      category: 'expense',
      summary: 'Receipt from Acme',
      extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
      reason: 'A receipt to file',
    };
    const sales = {
      action: 'keep',
      category: 'sales',
      summary: 'Globex pitches a CRM',
      extract: { company: 'Globex', solution: 'A CRM', problem: 'Scattered customer notes' },
      reason: 'A sales pitch',
    };
    const proposalsInOrder = [expense, sales, expense];
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'receipt-newest', threadId: 'thread-1', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'pitch', threadId: 'thread-2', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
        { ...budgetReview, id: 'receipt-older', threadId: 'thread-3', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const response = await postJson(app, '/group-verdicts', { category: 'expense', decision: 'confirmed' });

    expect(response.status).toBe(200);
    const stored = openVerdictStore(databasePath).loadAll();
    expect(stored.map(({ messageId }) => messageId).sort()).toEqual(['receipt-newest', 'receipt-older']);
    expect(stored.every(({ decision }) => decision === 'confirmed')).toBe(true);
  });

  it('proposes each message once when a second POST /triage-run starts while the first is still waiting on Claude', async () => {
    const askedMessageIds: string[] = [];
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const triage = {
      propose: async (message: { id: string }) => {
        askedMessageIds.push(message.id);
        await held;
        return {
          proposal: { action: 'keep', category: 'unknown', summary: 'A message', extract: {}, reason: 'Unsure' },
          costInUsd: 0.02,
          promptVersion: 'triage-v1',
        };
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [budgetReview, { ...budgetReview, id: 'message-2', threadId: 'thread-2' }],
    });

    const firstRun = postTriageRun(app);
    const secondRun = postTriageRun(app);
    release();
    await Promise.all([firstRun, secondRun]);

    expect(askedMessageIds.toSorted()).toEqual(['message-1', 'message-2']);
  });
  it('shows a message once in GET /triage-queue, with its latest proposal, when the store holds two proposals for it', async () => {
    const databasePath = temporaryDatabasePath();
    const before = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    await postJson(before, '/mail-report', budgetReviewReport);
    const store = openProposalStore(databasePath);
    const proposalOf = (summary: string, category: string) => ({
      action: 'keep',
      category,
      summary,
      extract: {},
      reason: 'Proposed twice by overlapping runs',
    });
    store.save({
      messageId: 'message-1',
      madeAt: '2026-11-02T15:00:00.000Z',
      promptVersion: 'triage-v1',
      proposal: proposalOf('First proposal', 'unknown'),
    });
    store.save({
      messageId: 'message-1',
      madeAt: '2026-11-02T15:01:00.000Z',
      promptVersion: 'triage-v1',
      proposal: proposalOf('Second proposal', 'unknown'),
    });

    const afterRestart = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    const queue = (await (await afterRestart.request('/triage-queue')).json()) as {
      action: { messageId: string; summary: string }[];
      remaining: number;
    };

    expect({
      action: queue.action.map(({ messageId, summary }) => ({ messageId, summary })),
      remaining: queue.remaining,
    }).toEqual({ action: [{ messageId: 'message-1', summary: 'Second proposal' }], remaining: 0 });
  });
  it('triages a message reported before a backend restart on the first POST /triage-run after it, handing the Triage port the snippet and thread id as reported', async () => {
    const databasePath = temporaryDatabasePath();
    const before = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    await postJson(before, '/mail-report', budgetReviewReport);
    const askedMessages: unknown[] = [];
    const triage = {
      propose: (message: unknown) => {
        askedMessages.push(message);
        return Promise.resolve({
          proposal: { action: 'keep', category: 'unknown', summary: 'A message', extract: {}, reason: 'Unsure' },
          costInUsd: 0,
          promptVersion: 'triage-v1',
        });
      },
    };

    const afterRestart = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage,
    });
    await postTriageRun(afterRestart);

    expect(askedMessages).toEqual([
      expect.objectContaining({
        id: 'message-1',
        threadId: 'thread-1',
        snippet: 'Can you review the budget by Friday?',
        from: 'Luis <luis@example.com>',
        subject: 'Budget review',
        accountEmail: 'ana@example.com',
      }) as unknown,
    ]);
  });
  it('opens a database created before Phase 2c and serves GET /triage-queue with its waiting system-update proposal as a digest and its automatic proposal of today under handled for you', async () => {
    const databasePath = temporaryDatabasePath();
    seedPrePhase2cDatabase(databasePath);

    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    const response = await app.request('/triage-queue');

    expect({ status: response.status, queue: await response.json() }).toMatchObject({
      status: 200,
      queue: {
        digests: [
          {
            accountEmail: 'ana@example.com',
            category: 'system-update',
            key: 'GitHub',
            count: 1,
            severityCounts: { high: 1 },
          },
        ],
        handledForYou: [{ messageId: 'message-cc', category: 'cc-thread', accountEmail: 'ana@example.com' }],
      },
    });
  });
});

function seedPrePhase2cDatabase(databasePath: string): void {
  const prePhase2cDatabase = openDatabase(databasePath);
  prePhase2cDatabase.exec(`
    CREATE TABLE reported_messages (message_id TEXT PRIMARY KEY, account_email TEXT NOT NULL);
    CREATE TABLE reported_message_recipients (message_id TEXT PRIMARY KEY, to_header TEXT, cc_header TEXT);
    CREATE TABLE reported_message_senders (message_id TEXT PRIMARY KEY, from_header TEXT NOT NULL, list_id TEXT);
    CREATE TABLE reported_message_subjects (message_id TEXT PRIMARY KEY, subject TEXT NOT NULL);
    CREATE TABLE reported_message_dates (message_id TEXT PRIMARY KEY, date_header TEXT NOT NULL);
    CREATE TABLE reported_message_bodies (message_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, snippet TEXT NOT NULL, body_text TEXT);
    CREATE TABLE proposals (message_id TEXT NOT NULL, made_at TEXT NOT NULL, prompt_version TEXT NOT NULL, proposal TEXT NOT NULL);
    CREATE TABLE automatic_proposals (message_id TEXT NOT NULL);
    CREATE TABLE category_modes (category TEXT NOT NULL, mode TEXT NOT NULL);
    CREATE TABLE verdicts (message_id TEXT NOT NULL, decision TEXT NOT NULL, correction TEXT, decided_at TEXT NOT NULL);
  `);
  const madeToday = '2026-11-02T15:00:00.000Z';
  for (const [messageId, from, proposal] of [
    [
      'message-system',
      'GitHub <noreply@github.com>',
      {
        action: 'archive',
        category: 'system-update',
        summary: 'GitHub build failed',
        extract: { system: 'GitHub', severity: 'high', significant: true },
        reason: 'A failed build',
      },
    ],
    [
      'message-cc',
      'Luis <luis@example.com>',
      {
        action: 'archive',
        category: 'cc-thread',
        summary: 'Luis shared the budget with the team',
        extract: {},
        reason: 'A cc thread',
      },
    ],
  ] as const) {
    prePhase2cDatabase.prepare('INSERT INTO reported_messages VALUES (?, ?)').run(messageId, 'ana@example.com');
    prePhase2cDatabase
      .prepare('INSERT INTO reported_message_recipients VALUES (?, ?, NULL)')
      .run(messageId, 'ana@example.com');
    prePhase2cDatabase.prepare('INSERT INTO reported_message_senders VALUES (?, ?, NULL)').run(messageId, from);
    prePhase2cDatabase.prepare('INSERT INTO reported_message_subjects VALUES (?, ?)').run(messageId, 'Update');
    prePhase2cDatabase
      .prepare('INSERT INTO reported_message_dates VALUES (?, ?)')
      .run(messageId, 'Mon, 2 Nov 2026 09:00:00 -0600');
    prePhase2cDatabase
      .prepare('INSERT INTO reported_message_bodies VALUES (?, ?, ?, NULL)')
      .run(messageId, `thread-${messageId}`, proposal.summary);
    prePhase2cDatabase
      .prepare('INSERT INTO proposals VALUES (?, ?, ?, ?)')
      .run(messageId, madeToday, currentTriagePromptVersion, JSON.stringify(proposal));
  }
  prePhase2cDatabase.exec("INSERT INTO category_modes VALUES ('cc-thread', 'automatic')");
  prePhase2cDatabase.exec("INSERT INTO automatic_proposals VALUES ('message-cc')");
  prePhase2cDatabase.close();
}
