import { taskRanks } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { promptFile } from './app.test-support';
import { createClaudePrioritization } from './claude-prioritization';
import { readStartupSettings } from './startup-settings';

interface SentRequest {
  model: string;
  system?: string;
  tools?: { name: string; strict?: boolean; input_schema: unknown }[];
  tool_choice?: unknown;
  messages?: { role: string; content: string }[];
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

  it('rejects an answer that fails the rank contract, returning no ranks and keeping the answer as the failure', async () => {
    const invalidAnswer = { ranks: [{ taskId: 'task-1', rank: 'first' }] };
    const prioritization = createClaudePrioritization({
      model: 'claude-opus-5-5',
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () => rankTasksAnswer(invalidAnswer),
    });

    const outcome = await prioritization.prioritize({
      tasks: [{ id: 'task-1', title: 'Approve the budget', accountEmail: 'ana@example.com' }],
      profile: '',
      calendar: [],
      urgentContacts: [],
    });

    expect(outcome).not.toHaveProperty('ranks');
    expect(outcome).toHaveProperty('failure', { input: invalidAnswer });
  });

  it('reports the cost of the call from its token usage and the model pricing, so the pass can log it against the daily spend', async () => {
    const prioritization = createClaudePrioritization({
      model: 'claude-opus-5-5',
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () =>
        rankTasksAnswer(
          { ranks: [{ taskId: 'task-1', rank: 1, reason: 'Only task' }] },
          { input_tokens: 1_000_000, output_tokens: 200_000 },
        ),
    });

    const outcome = await prioritization.prioritize({
      tasks: [{ id: 'task-1', title: 'Approve the budget', accountEmail: 'ana@example.com' }],
      profile: '',
      calendar: [],
      urgentContacts: [],
    });

    expect(outcome).toHaveProperty('costInUsd', 10);
  });

  it('sends every task (id, title, account, due time, waiting-on), the profile, the calendar and the urgent contacts under the prompt file, requiring the rank_tasks tool', async () => {
    const sentRequests: SentRequest[] = [];
    const prioritization = createClaudePrioritization({
      model: 'claude-opus-5-5',
      promptPath: promptFile('Rank the tasks by calling rank_tasks.', 'prioritize-v1.md'),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: (request: SentRequest) => {
        sentRequests.push(request);
        return rankTasksAnswer({ ranks: [{ taskId: 'task-7', rank: 1, reason: 'Only task' }] });
      },
    });

    await prioritization.prioritize({
      tasks: [
        {
          id: 'task-7',
          title: 'Sign the lease renewal',
          accountEmail: 'ana@acme.com',
          due: '2026-11-09T18:00:00.000Z',
          waitingOn: 'Bruno Landlord',
        },
      ],
      profile: 'Current priority: close the office move',
      calendar: [{ title: 'Board meeting', start: '2026-11-08T16:00:00.000Z' }],
      urgentContacts: [{ name: 'Carla Investor', reasons: ['deadline'] }],
    });

    const request = sentRequests[0];
    expect(request?.system).toBe('Rank the tasks by calling rank_tasks.');
    expect(request?.tools?.map(({ name, input_schema }) => ({ name, input_schema }))).toEqual([
      { name: 'rank_tasks', input_schema: taskRanks.toJSONSchema() },
    ]);
    expect(request?.tool_choice).toEqual({ type: 'tool', name: 'rank_tasks' });
    const content = request?.messages?.find((message) => message.role === 'user')?.content ?? '';
    for (const expected of [
      'task-7',
      'Sign the lease renewal',
      'ana@acme.com',
      '2026-11-09T18:00:00.000Z',
      'Bruno Landlord',
      'Current priority: close the office move',
      'Board meeting',
      'Carla Investor',
    ]) {
      expect(content).toContain(expected);
    }
  });
});
