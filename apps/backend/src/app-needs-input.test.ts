import { triageCategories } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { createApp, type AppOptions } from './app';
import { createEscalatingTriage } from './escalating-triage';
import {
  postJson,
  postTriageRun,
  proposeBudgetReview,
  getJson,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
  temporaryDatabasePath,
} from './app.test-support';
import { openVerdictStore } from './verdict-store';

// A cc-thread proposal as the escalating triage hands it on when its two models disagreed.
const ccThreadProposalWithDisagreement = (disagreement: { firstCategory: string; secondCategory: string }) => ({
  action: 'keep',
  category: 'cc-thread',
  summary: 'Luis copies the user on the budget thread',
  extract: {},
  reason: 'The user is only copied',
  disagreement,
});

async function needsInputAfterTriagingBudgetReview(
  triage: NonNullable<AppOptions['triage']>,
): Promise<{ questions: unknown[] }> {
  const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
  await proposeBudgetReview(app);
  return getJson<{ questions: unknown[] }>(app, '/needs-input');
}

describe('backend app: GET /needs-input', () => {
  it('asks which category is right for a message whose two triage models disagreed, offering both categories', async () => {
    const triage = triageAnswering(
      ccThreadProposalWithDisagreement({ firstCategory: 'action', secondCategory: 'cc-thread' }),
    );
    const needsInput = await needsInputAfterTriagingBudgetReview(triage);

    expect(needsInput.questions).toEqual([
      expect.objectContaining({
        kind: 'category',
        messageId: 'message-1',
        accountEmail: 'ana@example.com',
        choices: ['action', 'cc-thread'],
      }),
    ]);
  });

  it('asks nothing about a message whose two triage models agreed on its category', async () => {
    const actionProposal = {
      action: 'act',
      category: 'action',
      summary: 'Luis asks the user to review the budget',
      extract: {},
      reason: 'Luis asks the user directly',
    };
    const triage = createEscalatingTriage({
      first: triageAnswering(actionProposal),
      second: triageAnswering(actionProposal),
    });
    const needsInput = await needsInputAfterTriagingBudgetReview(triage);

    expect(needsInput.questions).toEqual([]);
  });

  it('still asks the category question of a message whose two triage models disagreed, after a backend restart on the same database file, with no triage call made again', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const triage = triageAnswering(
      ccThreadProposalWithDisagreement({ firstCategory: 'action', secondCategory: 'cc-thread' }),
    );
    const beforeRestart = createApp({ ...options, triage });
    await proposeBudgetReview(beforeRestart);

    const afterRestart = createApp(options);
    const needsInput = await getJson<{ questions: unknown[] }>(afterRestart, '/needs-input');

    expect(needsInput.questions).toEqual([
      expect.objectContaining({
        kind: 'category',
        messageId: 'message-1',
        accountEmail: 'ana@example.com',
        choices: ['action', 'cc-thread'],
      }),
    ]);
  });

  it('asks which category is right for a message proposed as unknown, offering every known category, with the message subject, summary and sender', async () => {
    const triage = triageAnswering({
      action: 'keep',
      category: 'unknown',
      summary: 'Luis writes about the budget',
      extract: {},
      reason: 'The message fits no category',
    });
    const needsInput = await needsInputAfterTriagingBudgetReview(triage);

    expect(needsInput.questions).toEqual([
      expect.objectContaining({
        kind: 'category',
        messageId: 'message-1',
        accountEmail: 'ana@example.com',
        choices: triageCategories.filter((category) => category !== 'unknown'),
        subject: 'Budget review',
        summary: 'Luis writes about the budget',
        from: 'Luis <luis@example.com>',
      }),
    ]);
  });

  it('records the category chosen in answer to a category question as the message verdict, and asks the question no more', async () => {
    const databasePath = temporaryDatabasePath();
    const triage = triageAnswering(
      ccThreadProposalWithDisagreement({ firstCategory: 'action', secondCategory: 'cc-thread' }),
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await proposeBudgetReview(app);

    await postJson(app, '/needs-input/answers', { kind: 'category', messageId: 'message-1', answer: 'action' });

    expect(openVerdictStore(databasePath).loadAll()).toEqual([
      expect.objectContaining({ messageId: 'message-1', correction: { category: 'action' } }),
    ]);
    expect((await getJson<{ questions: unknown[] }>(app, '/needs-input')).questions).toEqual([]);
  });

  it('hands triage the category chosen in answer to a category question as an example for a later message from the same sender', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = {
      propose: (message: { id: string }, examples?: unknown[]) => {
        examplesByMessageId.set(message.id, examples);
        return Promise.resolve({
          proposal: ccThreadProposalWithDisagreement({ firstCategory: 'action', secondCategory: 'cc-thread' }),
          costInUsd: 0,
          promptVersion: 'triage-v1',
        });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await proposeBudgetReview(app);
    await postJson(app, '/needs-input/answers', { kind: 'category', messageId: 'message-1', answer: 'action' });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, id: 'message-2', threadId: 'thread-2', subject: 'Budget follow-up' }],
    });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-2')).toEqual([
      expect.objectContaining({ messageId: 'message-1', category: 'action' }),
    ]);
  });

  it('asks whether a sender with no earlier message is VIP or ordinary when their message asks the user for something, naming the sender and the ask', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks the user to review the budget',
      extract: {},
      reason: 'Luis asks the user directly',
      asks: [{ ask: 'Review the budget', due: '2026-11-06' }],
    });
    const needsInput = await needsInputAfterTriagingBudgetReview(triage);

    expect(needsInput.questions).toEqual([
      expect.objectContaining({
        kind: 'new-sender',
        senderEmail: 'luis@example.com',
        messageId: 'message-1',
        accountEmail: 'ana@example.com',
        choices: ['vip', 'ordinary'],
        senderName: 'Luis',
        asks: ['Review the budget'],
      }),
    ]);
  });

  it('asks nothing about a sender with no earlier message when their message asks the user nothing', async () => {
    const triage = triageAnswering({
      action: 'keep',
      category: 'action',
      summary: 'Luis shares the budget',
      extract: {},
      reason: 'Luis writes to the user directly',
      asks: [],
    });
    const needsInput = await needsInputAfterTriagingBudgetReview(triage);

    expect(needsInput.questions).toEqual([]);
  });

  it('asks nothing about a sender with an earlier message when their later message asks the user for something', async () => {
    const triage = {
      propose: (message: { id: string }) =>
        Promise.resolve({
          proposal: {
            action: 'act',
            category: 'action',
            summary: 'Luis writes about the budget',
            extract: {},
            reason: 'Luis writes to the user directly',
            asks: message.id === 'message-1' ? [{ ask: 'Review the budget', due: '2026-11-06' }] : [],
          },
          costInUsd: 0,
          promptVersion: 'triage-v1',
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReview,
          id: 'message-0',
          threadId: 'thread-0',
          subject: 'Budget kickoff',
          date: 'Mon, 26 Oct 2026 09:00:00 -0600',
          snippet: 'Here is the first budget draft.',
        },
        budgetReview,
      ],
    });
    await postTriageRun(app);

    const needsInput = await getJson<{ questions: unknown[] }>(app, '/needs-input');

    expect(needsInput.questions).toEqual([]);
  });

  it('marks the sender VIP when a new-sender question is answered "vip", and asks the question no more', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks the user to review the budget',
      extract: {},
      reason: 'Luis asks the user directly',
      asks: [{ ask: 'Review the budget', due: '2026-11-06' }],
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    await postJson(app, '/needs-input/answers', {
      kind: 'new-sender',
      senderEmail: 'luis@example.com',
      messageId: 'message-1',
      answer: 'vip',
    });

    const people = await getJson<{ vip: { emails: string[] }[] }>(app, '/people');
    expect(people.vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
    expect((await getJson<{ questions: unknown[] }>(app, '/needs-input')).questions).toEqual([]);
  });

  it('leaves the sender unmarked when a new-sender question is answered "ordinary", and asks the question no more', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks the user to review the budget',
      extract: {},
      reason: 'Luis asks the user directly',
      asks: [{ ask: 'Review the budget', due: '2026-11-06' }],
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    await postJson(app, '/needs-input/answers', {
      kind: 'new-sender',
      senderEmail: 'luis@example.com',
      messageId: 'message-1',
      answer: 'ordinary',
    });

    const people = await getJson<{ vip: { emails: string[] }[] }>(app, '/people');
    expect(people.vip).toEqual([]);
    expect((await getJson<{ questions: unknown[] }>(app, '/needs-input')).questions).toEqual([]);
  });
  it('counts each unanswered Needs input question in the GET /now badge count', async () => {
    const triage = triageAnswering(
      ccThreadProposalWithDisagreement({ firstCategory: 'action', secondCategory: 'cc-thread' }),
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const now = await getJson<{ badgeCount: number }>(app, '/now');

    expect(now.badgeCount).toBe(1);
  });
});
