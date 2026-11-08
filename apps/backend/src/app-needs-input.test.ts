import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { createEscalatingTriage } from './escalating-triage';
import {
  postJson,
  postTriageRun,
  getJson,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
} from './app.test-support';

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
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const needsInput = await getJson<{ questions: unknown[] }>(app, '/needs-input');

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
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const needsInput = await getJson<{ questions: unknown[] }>(app, '/needs-input');

    expect(needsInput.questions).toEqual([]);
  });
});
