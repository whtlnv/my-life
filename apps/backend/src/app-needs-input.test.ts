import { describe, expect, it } from 'vitest';

import { createApp } from './app';
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
});
