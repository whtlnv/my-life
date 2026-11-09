import { describe, expect, it } from 'vitest';

import { createClaudePrioritization } from './claude-prioritization';
import { readStartupSettings } from './startup-settings';

interface SentRequest {
  model: string;
}

function rankTasksAnswer(input: unknown, usage = { input_tokens: 0, output_tokens: 0 }) {
  return Promise.resolve({
    content: [{ type: 'tool_use', id: 'tool-use-1', name: 'rank_tasks', input }],
    usage,
  });
}

describe('Claude prioritization', () => {
  it('asks the prioritization model from the default settings (Opus 5.5) and returns the rank and reason it gives each task', async () => {
    const settings = readStartupSettings({}, '/Users/ana');
    const sentRequests: SentRequest[] = [];
    const prioritization = createClaudePrioritization({
      model: settings.prioritizationModel,
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: (request: SentRequest) => {
        sentRequests.push(request);
        return rankTasksAnswer({
          ranks: [
            { taskId: 'task-2', rank: 1, reason: 'Due in two hours' },
            { taskId: 'task-1', rank: 2, reason: 'No deadline' },
          ],
        });
      },
    });

    const ranked = await prioritization.prioritize({
      tasks: [
        { id: 'task-1', title: 'Approve the budget', accountEmail: 'ana@example.com' },
        { id: 'task-2', title: 'Send the contract', accountEmail: 'ana@example.com', due: '2026-11-08T17:00:00.000Z' },
      ],
      profile: '',
      calendar: [],
      urgentContacts: [],
    });

    expect(sentRequests.map(({ model }) => model)).toEqual(['claude-opus-5-5']);
    expect(ranked.ranks).toEqual([
      { taskId: 'task-2', rank: 1, reason: 'Due in two hours' },
      { taskId: 'task-1', rank: 2, reason: 'No deadline' },
    ]);
  });
});
