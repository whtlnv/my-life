import { triageCategories } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { createApp, type AppOptions } from './app';
import { createEscalatingTriage } from './escalating-triage';
import {
  postJson,
  postTriageRun,
  getJson,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
  temporaryDatabasePath,
} from './app.test-support';
import { openVerdictStore } from './verdict-store';

async function needsInputAfterTriagingBudgetReview(
  triage: NonNullable<AppOptions['triage']>,
): Promise<{ questions: unknown[] }> {
  const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
  await postJson(app, '/mail-report', budgetReviewReport);
  await postTriageRun(app);
  return getJson<{ questions: unknown[] }>(app, '/needs-input');
}

describe('backend app: GET /needs-input', () => {
  it('asks which category is right for a message whose two triage models disagreed, offering both categories', async () => {
    const triage = triageAnswering({
      action: 'keep',
      category: 'cc-thread',
      summary: 'Luis copies the user on the budget thread',
      extract: {},
      reason: 'The user is only copied',
      disagreement: { firstCategory: 'action', secondCategory: 'cc-thread' },
    });
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
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath: temporaryDatabasePath() };
    const triage = triageAnswering({
      action: 'keep',
      category: 'cc-thread',
      summary: 'Luis copies the user on the budget thread',
      extract: {},
      reason: 'The user is only copied',
      disagreement: { firstCategory: 'action', secondCategory: 'cc-thread' },
    });
    const beforeRestart = createApp({ ...options, triage });
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);
    await postTriageRun(beforeRestart);

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

  it('asks which category is right for a message proposed as unknown, offering every known category', async () => {
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
      }),
    ]);
  });

  it('records the category chosen in answer to a category question as the message verdict, and asks the question no more', async () => {
    const databasePath = temporaryDatabasePath();
    const triage = triageAnswering({
      action: 'keep',
      category: 'cc-thread',
      summary: 'Luis copies the user on the budget thread',
      extract: {},
      reason: 'The user is only copied',
      disagreement: { firstCategory: 'action', secondCategory: 'cc-thread' },
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

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
          proposal: {
            action: 'keep',
            category: 'cc-thread',
            summary: 'Luis copies the user on the budget thread',
            extract: {},
            reason: 'The user is only copied',
            disagreement: { firstCategory: 'action', secondCategory: 'cc-thread' },
          },
          costInUsd: 0,
          promptVersion: 'triage-v1',
        });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
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

  it('asks whether a sender with no earlier message is VIP or ordinary when their message asks the user for something', async () => {
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
      }),
    ]);
  });
});
