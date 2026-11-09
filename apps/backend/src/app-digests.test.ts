import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { openSpendStore } from './spend-store';
import { openVerdictStore } from './verdict-store';

import {
  postJson,
  postTriageRun,
  getJson,
  temporaryDatabasePath,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
  triageAnsweringInOrder,
} from './app.test-support';

describe('backend app: digests and their confirmation', () => {
  it('returns in GET /triage-queue the waiting system-update, sales and calendar-drive proposals as digests, each with its account, category, key, item count and severity counts', async () => {
    const proposalsInOrder = [
      {
        action: 'archive',
        category: 'system-update',
        summary: 'GitHub build failed',
        extract: { system: 'GitHub', severity: 'high', significant: true },
        reason: 'A failed build',
      },
      systemUpdateNotice('GitHub', 'GitHub build passed'),
      {
        action: 'archive',
        category: 'sales',
        summary: 'Acme offers a discount',
        extract: { company: 'Acme' },
        reason: 'A sales pitch',
      },
      {
        action: 'archive',
        category: 'calendar-drive',
        summary: 'Marta shared a document',
        extract: { item: 'Q4 plan', change: 'shared' },
        reason: 'A Drive share notification',
      },
    ];
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReview,
          id: 'message-failed',
          from: 'GitHub <noreply@github.com>',
          date: 'Mon, 2 Nov 2026 10:00:00 -0600',
        },
        {
          ...budgetReview,
          id: 'message-passed',
          from: 'GitHub <noreply@github.com>',
          date: 'Mon, 2 Nov 2026 09:00:00 -0600',
        },
        {
          ...budgetReview,
          id: 'message-sales',
          from: 'Acme <sales@acme.example>',
          date: 'Mon, 2 Nov 2026 08:00:00 -0600',
        },
        {
          ...budgetReview,
          id: 'message-drive',
          from: 'Google Drive <drive-shares@google.com>',
          date: 'Mon, 2 Nov 2026 07:00:00 -0600',
        },
      ],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { digests } = (await queue.json()) as { digests: unknown[] };
    expect(digests).toHaveLength(3);
    expect(digests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountEmail: 'ana@example.com',
          category: 'system-update',
          key: 'GitHub',
          count: 2,
          severityCounts: { high: 1, low: 1 },
        }),
        expect.objectContaining({
          accountEmail: 'ana@example.com',
          category: 'sales',
          key: 'sales@acme.example',
          count: 1,
          severityCounts: {},
        }),
        expect.objectContaining({
          accountEmail: 'ana@example.com',
          category: 'calendar-drive',
          key: 'drive-shares@google.com',
          count: 1,
          severityCounts: {},
        }),
      ]),
    );
  });

  it('lists in each GET /triage-queue digest its significant items, each with its message id, summary, account and Gmail link, and none of its items that are not significant', async () => {
    const triage = triageAnsweringInOrder(
      [
        {
          action: 'archive',
          category: 'system-update',
          summary: 'GitHub build failed',
          extract: { system: 'GitHub', severity: 'high', significant: true },
          reason: 'A failed build',
        },
        systemUpdateNotice('GitHub', 'GitHub build passed'),
      ],
      1,
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReview,
          id: 'message-failed',
          from: 'GitHub <noreply@github.com>',
          date: 'Mon, 2 Nov 2026 10:00:00 -0600',
        },
        {
          ...budgetReview,
          id: 'message-passed',
          from: 'GitHub <noreply@github.com>',
          date: 'Mon, 2 Nov 2026 09:00:00 -0600',
        },
      ],
    });
    await postTriageRun(app);

    const { digests } = await getJson<{ digests: { significantItems?: unknown }[] }>(app, '/triage-queue');

    expect(digests).toHaveLength(1);
    expect(digests[0]?.significantItems).toEqual([
      {
        messageId: 'message-failed',
        summary: 'GitHub build failed',
        accountEmail: 'ana@example.com',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-failed',
      },
    ]);
  });

  it('adds a proposal triaged after a digest was listed in GET /triage-queue to that same digest, which keeps its id, when it has the same account, category and key', async () => {
    const triage = triageAnsweringInOrder(
      [systemUpdateNotice('GitHub', 'GitHub build passed'), systemUpdateNotice('GitHub', 'GitHub deploy done')],
      1,
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await reportFromGitHub(app, 'message-build');
    await postTriageRun(app);
    const { digests: before } = await getJson<{ digests: { id: unknown }[] }>(app, '/triage-queue');

    await reportFromGitHub(app, 'message-deploy');
    await postTriageRun(app);

    const { digests: after } = await getJson<{ digests: { id: unknown; count: number }[] }>(app, '/triage-queue');
    expect(before[0]?.id).toEqual(expect.any(String));
    expect(after).toEqual([expect.objectContaining({ id: before[0]?.id, count: 2 })]);
  });

  it('carries on each digest in GET /triage-queue the summary lines the summary model wrote for its items during the triage run', async () => {
    const triage = triageAnswering(systemUpdateNotice('GitHub', 'GitHub build passed'));
    const summaryLines = ['GitHub: 1 notice since Monday, none significant'];
    const summary = { summarize: () => Promise.resolve({ lines: summaryLines, costInUsd: 0.01 }) };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary });
    await reportFromGitHub(app, 'message-build');

    await postTriageRun(app);

    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(digests).toEqual([expect.objectContaining({ key: 'GitHub', summaryLines })]);
  });

  it('rewrites the summary lines of a digest from its new set of items when a proposal joins it on a later triage run', async () => {
    const triage = triageAnsweringInOrder(
      [systemUpdateNotice('GitHub', 'GitHub build passed'), systemUpdateNotice('GitHub', 'GitHub deploy done')],
      1,
    );
    const summary = {
      summarize: (request?: { items?: { summary: string }[] }) =>
        Promise.resolve({
          lines: [(request?.items ?? []).map((item) => item.summary).join(' and ')],
          costInUsd: 0.01,
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary });
    await reportFromGitHub(app, 'message-build');
    await postTriageRun(app);

    await reportFromGitHub(app, 'message-deploy');
    await postTriageRun(app);

    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(digests).toEqual([
      expect.objectContaining({ key: 'GitHub', summaryLines: ['GitHub build passed and GitHub deploy done'] }),
    ]);
  });

  it('asks the summary model once per digest with only the item summaries of that digest, and carries on each digest its own summary lines', async () => {
    const proposalsInOrder = [
      systemUpdateNotice('GitHub', 'GitHub build passed'),
      systemUpdateNotice('Jenkins', 'Jenkins job finished'),
      { action: 'archive', category: 'expense', summary: 'Receipt from Acme', reason: 'A receipt to file' },
      {
        action: 'keep',
        category: 'cc-thread',
        summary: 'Luis copied the team',
        reason: 'A thread the user is copied on',
      },
    ];
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
    const summaryRequests: string[][] = [];
    const summary = {
      summarize: (request?: { items?: { summary: string }[] }) => {
        const itemSummaries = (request?.items ?? []).map((item) => item.summary);
        summaryRequests.push(itemSummaries);
        return Promise.resolve({ lines: [`Lines for ${itemSummaries.join(', ')}`], costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-github', threadId: 'message-github', from: 'GitHub <noreply@github.com>' },
        { ...budgetReview, id: 'message-jenkins', threadId: 'message-jenkins', from: 'Jenkins <ci@jenkins.example>' },
        { ...budgetReview, id: 'message-expense', threadId: 'message-expense', from: 'Acme <billing@acme.example>' },
        { ...budgetReview, id: 'message-cc', threadId: 'message-cc', from: 'Luis <luis@example.com>' },
      ],
    });

    await postTriageRun(app);

    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(summaryRequests).toHaveLength(2);
    expect(summaryRequests).toEqual(expect.arrayContaining([['GitHub build passed'], ['Jenkins job finished']]));
    expect(digests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'GitHub', summaryLines: ['Lines for GitHub build passed'] }),
        expect.objectContaining({ key: 'Jenkins', summaryLines: ['Lines for Jenkins job finished'] }),
      ]),
    );
  });

  it('keeps the summary lines of a digest when a later triage run adds no proposal to it', async () => {
    const triage = triageAnswering(systemUpdateNotice('GitHub', 'GitHub build passed'));
    let summaryCalls = 0;
    const summary = {
      summarize: () => {
        summaryCalls += 1;
        return Promise.resolve({ lines: [`Summary written on call ${String(summaryCalls)}`], costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary });
    await reportFromGitHub(app, 'message-build');
    await postTriageRun(app);

    await postTriageRun(app);

    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(digests).toEqual([expect.objectContaining({ key: 'GitHub', summaryLines: ['Summary written on call 1'] })]);
  });

  it('rewrites the summary lines of a digest from the items left in it on the next triage run after the user gives one of its items its own verdict', async () => {
    const triage = triageAnsweringInOrder(
      [systemUpdateNotice('GitHub', 'GitHub build passed'), systemUpdateNotice('GitHub', 'GitHub deploy done')],
      1,
    );
    const summary = {
      summarize: (request?: { items?: { summary: string }[] }) =>
        Promise.resolve({
          lines: [(request?.items ?? []).map((item) => item.summary).join(' and ')],
          costInUsd: 0.01,
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-build', threadId: 'message-build', from: 'GitHub <noreply@github.com>' },
        { ...budgetReview, id: 'message-deploy', threadId: 'message-deploy', from: 'GitHub <noreply@github.com>' },
      ],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-deploy', decision: 'confirmed' });

    await postTriageRun(app);

    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(digests).toEqual([expect.objectContaining({ key: 'GitHub', summaryLines: ['GitHub build passed'] })]);
  });

  it('still carries on a digest in GET /triage-queue, after a backend restart on the same database file, the summary lines written before it, without a new summary call', async () => {
    const triage = triageAnswering(systemUpdateNotice('GitHub', 'GitHub build passed'));
    let summaryCalls = 0;
    const summary = {
      summarize: () => {
        summaryCalls += 1;
        return Promise.resolve({ lines: [`Summary written on call ${String(summaryCalls)}`], costInUsd: 0.01 });
      },
    };
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary, databasePath };
    const beforeRestart = createApp(options);
    await reportFromGitHub(beforeRestart, 'message-build');
    await postTriageRun(beforeRestart);

    const afterRestart = createApp(options);
    await postTriageRun(afterRestart);
    const { digests } = await getJson<{ digests: unknown[] }>(afterRestart, '/triage-queue');

    expect(summaryCalls).toBe(1);
    expect(digests).toEqual([expect.objectContaining({ key: 'GitHub', summaryLines: ['Summary written on call 1'] })]);
  });

  it('logs the cost of each summary call made at POST /triage-run as spend, with its time, next to the triage spend', async () => {
    const triage = triageAnswering(systemUpdateNotice('GitHub', 'GitHub build passed'));
    const summary = { summarize: () => Promise.resolve({ lines: ['GitHub: 1 notice'], costInUsd: 0.25 }) };
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage,
      summary,
    });
    await reportFromGitHub(app, 'message-build');

    await postTriageRun(app);

    expect(
      openSpendStore(databasePath)
        .loadAll()
        .map(({ spentAt, costInUsd }) => ({ spentAt, costInUsd })),
    ).toEqual([
      { spentAt: '2026-11-02T15:10:00.000Z', costInUsd: 1 },
      { spentAt: '2026-11-02T15:10:00.000Z', costInUsd: 0.25 },
    ]);
  });

  it('logs each summary spend at POST /triage-run with the model the summary call ran on, not an empty string', async () => {
    const triage = triageAnswering(systemUpdateNotice('GitHub', 'GitHub build passed'));
    const summary = {
      summarize: () =>
        Promise.resolve({ lines: ['GitHub: 1 notice'], costInUsd: 0.25, model: 'claude-summary-model-from-settings' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage,
      summary,
    });
    await reportFromGitHub(app, 'message-build');

    await postTriageRun(app);

    expect(
      openSpendStore(databasePath)
        .loadAll()
        .filter(({ costInUsd }) => costInUsd === 0.25)
        .map(({ model }) => model),
    ).toEqual(['claude-summary-model-from-settings']);
  });

  it("writes no summary at POST /triage-run once today's spend reaches the daily ceiling, and still returns the digest in GET /triage-queue without summary lines", async () => {
    const triage = triageAnswering(systemUpdateNotice('GitHub', 'GitHub build passed'));
    let summaryCalls = 0;
    const summary = {
      summarize: () => {
        summaryCalls += 1;
        return Promise.resolve({ lines: ['GitHub: 1 notice'], costInUsd: 0.25 });
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 1,
      triage,
      summary,
    });
    await reportFromGitHub(app, 'message-build');

    await postTriageRun(app);

    const { digests } = await getJson<{ digests: object[] }>(app, '/triage-queue');
    expect(summaryCalls).toBe(0);
    expect(digests).toHaveLength(1);
    expect(digests[0]).toMatchObject({ key: 'GitHub' });
    expect(digests[0]).not.toHaveProperty('summaryLines');
  });

  it('answers POST /triage-run with 200 when the summary model answers with output that fails validation, and still returns the digest in GET /triage-queue without summary lines', async () => {
    const triage = triageAnswering(systemUpdateNotice('GitHub', 'GitHub build passed'));
    const summary = {
      summarize: () => Promise.reject(new Error('The summary model answered with output that fails validation')),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary });
    await reportFromGitHub(app, 'message-build');

    const triageRun = await postTriageRun(app);

    const queue = await app.request('/triage-queue');
    const { digests } = (await queue.json()) as { digests: object[] };
    expect(triageRun.status).toBe(200);
    expect(queue.status).toBe(200);
    expect(digests).toHaveLength(1);
    expect(digests[0]).toMatchObject({ key: 'GitHub' });
    expect(digests[0]).not.toHaveProperty('summaryLines');
  });

  it('opens in GET /triage-queue a fresh digest, with a new id and only the new proposal, for a proposal of the same account, category and key triaged after its digest was confirmed', async () => {
    const triage = triageAnsweringInOrder(
      [systemUpdateNotice('GitHub', 'GitHub build passed'), systemUpdateNotice('GitHub', 'GitHub deploy done')],
      1,
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await reportFromGitHub(app, 'message-build');
    await postTriageRun(app);
    const { digests: before } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');
    const confirmedDigestId = before[0]?.id ?? '';
    await app.request(`/digests/${encodeURIComponent(confirmedDigestId)}/confirmation`, { method: 'POST' });

    await reportFromGitHub(app, 'message-deploy');
    await postTriageRun(app);

    const { digests: after } = await getJson<{ digests: { id: string; key: string; count: number }[] }>(
      app,
      '/triage-queue',
    );
    expect(confirmedDigestId).toEqual(expect.any(String));
    expect(after).toEqual([expect.objectContaining({ key: 'GitHub', count: 1 })]);
    expect(after[0]?.id).not.toEqual(confirmedDigestId);
  });

  it('leaves in GET /triage-queue, as a fresh digest of its own, a proposal that joined a digest after the dashboard loaded it and before that digest was confirmed', async () => {
    const triage = triageAnsweringInOrder(
      [systemUpdateNotice('GitHub', 'GitHub build passed'), systemUpdateNotice('GitHub', 'GitHub deploy done')],
      1,
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await reportFromGitHub(app, 'message-build');
    await postTriageRun(app);
    const { digests: loaded } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');
    const loadedDigestId = loaded[0]?.id ?? '';

    await reportFromGitHub(app, 'message-deploy');
    await postTriageRun(app);
    await app.request(`/digests/${encodeURIComponent(loadedDigestId)}/confirmation`, { method: 'POST' });

    const { digests: after } = await getJson<{ digests: { id: string; key: string; count: number }[] }>(
      app,
      '/triage-queue',
    );
    expect(loadedDigestId).toEqual(expect.any(String));
    expect(after).toEqual([expect.objectContaining({ key: 'GitHub', count: 1 })]);
    expect(after[0]?.id).not.toEqual(loadedDigestId);
  });

  it('refuses a confirmation posted at POST /digests/:id/confirmation for an unknown digest as not found, and stores no verdict', async () => {
    const databasePath = temporaryDatabasePath();
    const triage = triageAnsweringInOrder([systemUpdateNotice('GitHub', 'GitHub build passed')], 1);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, databasePath });
    await reportFromGitHub(app, 'message-build');
    await postTriageRun(app);
    await getJson(app, '/triage-queue');

    const response = await app.request('/digests/unknown-digest/confirmation', { method: 'POST' });

    expect(response.status).toBe(404);
    expect(openVerdictStore(databasePath).loadAll()).toEqual([]);
  });

  it('confirms after a backend restart on the same database file a digest the dashboard loaded before it, reaching only the proposals it held then and leaving the later one in a fresh digest', async () => {
    const triage = triageAnsweringInOrder(
      [systemUpdateNotice('GitHub', 'GitHub build passed'), systemUpdateNotice('GitHub', 'GitHub deploy done')],
      1,
    );
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, databasePath };
    const beforeRestart = createApp(options);
    await reportFromGitHub(beforeRestart, 'message-build');
    await postTriageRun(beforeRestart);
    const { digests: loaded } = await getJson<{ digests: { id: string }[] }>(beforeRestart, '/triage-queue');
    const confirmedDigestId = loaded[0]?.id ?? '';
    await reportFromGitHub(beforeRestart, 'message-deploy');
    await postTriageRun(beforeRestart);

    const afterRestart = createApp(options);
    await afterRestart.request(`/digests/${encodeURIComponent(confirmedDigestId)}/confirmation`, { method: 'POST' });
    const { digests: after } = await getJson<{ digests: { id: string; key: string; count: number }[] }>(
      afterRestart,
      '/triage-queue',
    );

    expect(confirmedDigestId).toEqual(expect.any(String));
    expect(
      openVerdictStore(databasePath)
        .loadAll()
        .map(({ messageId }) => messageId),
    ).toEqual(['message-build']);
    expect(after).toEqual([expect.objectContaining({ key: 'GitHub', count: 1 })]);
    expect(after[0]?.id).not.toEqual(confirmedDigestId);
  });

  it('lists at GET /commands an archive command for each item of a digest confirmed at POST /digests/:id/confirmation whose own proposal is archive', async () => {
    const commandedMessageIds = await commandedMessageIdsAfterConfirmingGitHubDigest([
      { id: 'message-build', action: 'archive', summary: 'GitHub build passed' },
      { id: 'message-deploy', action: 'archive', summary: 'GitHub deploy done' },
    ]);

    expect(commandedMessageIds.sort()).toEqual(['message-build', 'message-deploy']);
  });

  it('lists at GET /commands no archive command for an item of a digest confirmed at POST /digests/:id/confirmation whose own proposal is keep', async () => {
    const commandedMessageIds = await commandedMessageIdsAfterConfirmingGitHubDigest([
      { id: 'message-build', action: 'archive', summary: 'GitHub build passed' },
      { id: 'message-advisory', action: 'keep', summary: 'GitHub security advisory' },
    ]);

    expect(commandedMessageIds).toEqual(['message-build']);
  });

  it('keeps in GET /triage-queue, with no archive command at GET /commands, another system-update digest of the same account after a digest is confirmed at POST /digests/:id/confirmation', async () => {
    const notice = (system: string) => ({
      action: 'archive',
      category: 'system-update',
      summary: `${system} build passed`,
      extract: { system, severity: 'low', significant: false },
      reason: 'A routine notification',
    });
    const triage = triageAnsweringInOrder([notice('GitHub'), notice('Vercel')], 1);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-github', threadId: 'message-github', from: 'GitHub <noreply@github.com>' },
        {
          ...budgetReview,
          id: 'message-vercel',
          threadId: 'message-vercel',
          from: 'Vercel <notifications@vercel.com>',
        },
      ],
    });
    await postTriageRun(app);
    const { digests: before } = await getJson<{ digests: { id: string; key: string }[] }>(app, '/triage-queue');
    const gitHubDigestId = before.find(({ key }) => key === 'GitHub')?.id ?? '';

    await app.request(`/digests/${encodeURIComponent(gitHubDigestId)}/confirmation`, { method: 'POST' });

    const { digests: after } = await getJson<{ digests: { key: string }[] }>(app, '/triage-queue');
    const { commands } = await getJson<{ commands: { messageId: string }[] }>(
      app,
      '/commands?accountEmail=ana%40example.com',
    );
    expect(after).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'Vercel', category: 'system-update', count: 1 })]),
    );
    expect(commands.map(({ messageId }) => messageId)).toEqual(['message-github']);
  });

  it('no longer lists in GET /triage-queue a digest confirmed at POST /digests/:id/confirmation, nor its items in any group', async () => {
    const triage = triageAnsweringInOrder([systemUpdateNotice('GitHub', 'GitHub build passed')], 1);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await reportFromGitHub(app, 'message-github');
    await postTriageRun(app);
    const { digests: before } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');

    await app.request(`/digests/${encodeURIComponent(before[0]?.id ?? '')}/confirmation`, { method: 'POST' });

    const after = await getJson<{ digests: unknown[]; groups: { items: { messageId: string }[] }[] }>(
      app,
      '/triage-queue',
    );
    expect(before).toHaveLength(1);
    expect(after.digests).toEqual([]);
    expect(after.groups.flatMap(({ items }) => items.map(({ messageId }) => messageId))).not.toContain(
      'message-github',
    );
  });
});

async function commandedMessageIdsAfterConfirmingGitHubDigest(
  notices: { id: string; action: string; summary: string }[],
): Promise<string[]> {
  const triage = triageAnsweringInOrder(
    notices.map(({ action, summary }) => ({
      action,
      category: 'system-update',
      summary,
      extract: { system: 'GitHub', severity: 'low', significant: false },
      reason: 'A routine notification',
    })),
    1,
  );
  const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
  const [budgetReview] = budgetReviewReport.messages;
  await postJson(app, '/mail-report', {
    ...budgetReviewReport,
    messages: notices.map(({ id }) => ({ ...budgetReview, id, threadId: id, from: 'GitHub <noreply@github.com>' })),
  });
  await postTriageRun(app);
  const { digests } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');
  await app.request(`/digests/${encodeURIComponent(digests[0]?.id ?? '')}/confirmation`, { method: 'POST' });
  const { commands } = await getJson<{ commands: { messageId: string }[] }>(
    app,
    '/commands?accountEmail=ana%40example.com',
  );
  return commands.map(({ messageId }) => messageId);
}

function systemUpdateNotice(system: string, summary: string) {
  return {
    action: 'archive',
    category: 'system-update',
    summary,
    extract: { system, severity: 'low', significant: false },
    reason: 'A routine notification',
  };
}

async function reportFromGitHub(app: ReturnType<typeof createApp>, id: string) {
  const [budgetReview] = budgetReviewReport.messages;
  return postJson(app, '/mail-report', {
    ...budgetReviewReport,
    messages: [{ ...budgetReview, id, threadId: id, from: 'GitHub <noreply@github.com>' }],
  });
}
