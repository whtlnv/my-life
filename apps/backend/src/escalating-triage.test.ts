import { describe, expect, it } from 'vitest';

import { createEscalatingTriage } from './escalating-triage';

const message = { id: 'message-1', date: '2026-11-08T10:00:00Z', accountEmail: 'ana@example.com' };

const answering = (model: string, category: string, costInUsd: number, asked: string[]) => ({
  propose: (asked_message: { id: string }) => {
    asked.push(`${model}:${asked_message.id}`);
    return Promise.resolve({
      model,
      promptVersion: 'triage-v1',
      costInUsd,
      proposal: { action: 'archive', category, summary: `${model} says ${category}`, extract: {}, reason: 'test' },
    });
  },
});

describe('createEscalatingTriage', () => {
  it('answers with the first model alone when it files the message under a category other than action or unknown', async () => {
    const asked: string[] = [];
    const triage = createEscalatingTriage({
      first: answering('claude-haiku-5-5', 'sales', 0.0005, asked),
      second: answering('claude-opus-5-5', 'sales', 0.015, asked),
    });

    const outcome = await triage.propose(message);

    expect({ asked, outcome }).toEqual({
      asked: ['claude-haiku-5-5:message-1'],
      outcome: expect.objectContaining({
        model: 'claude-haiku-5-5',
        costInUsd: 0.0005,
        proposal: expect.objectContaining({ summary: 'claude-haiku-5-5 says sales' }) as unknown,
      }) as unknown,
    });
  });
  it('asks the second model when the first says the message needs the user, answers with the second opinion and charges both calls', async () => {
    const asked: string[] = [];
    const triage = createEscalatingTriage({
      first: answering('claude-haiku-5-5', 'action', 0.0005, asked),
      second: answering('claude-opus-5-5', 'cc-thread', 0.015, asked),
    });

    const outcome = await triage.propose(message);

    expect({ asked, outcome }).toEqual({
      asked: ['claude-haiku-5-5:message-1', 'claude-opus-5-5:message-1'],
      outcome: expect.objectContaining({
        model: 'claude-opus-5-5',
        costInUsd: 0.0155,
        proposal: expect.objectContaining({ summary: 'claude-opus-5-5 says cc-thread' }) as unknown,
      }) as unknown,
    });
  });
  it('keeps both categories with the proposal when the second opinion files the message under a different category than the first', async () => {
    const triage = createEscalatingTriage({
      first: answering('claude-haiku-5-5', 'action', 0.0005, []),
      second: answering('claude-opus-5-5', 'cc-thread', 0.015, []),
    });

    const outcome = await triage.propose(message);

    expect(outcome.proposal).toEqual(
      expect.objectContaining({
        category: 'cc-thread',
        disagreement: { firstCategory: 'action', secondCategory: 'cc-thread' },
      }),
    );
  });
  it('stores no disagreement when the second opinion files the message under the same category as the first', async () => {
    const triage = createEscalatingTriage({
      first: answering('claude-haiku-5-5', 'action', 0.0005, []),
      second: answering('claude-opus-5-5', 'action', 0.015, []),
    });

    const outcome = await triage.propose(message);

    expect(outcome.proposal).not.toHaveProperty('disagreement');
  });
  it.each([
    { reason: 'cannot place the message (unknown)', firstAnswer: answering('claude-haiku-5-5', 'unknown', 0.0005, []) },
    {
      reason: 'returns no proposal at all',
      firstAnswer: {
        propose: () => Promise.resolve({ model: 'claude-haiku-5-5', promptVersion: 'triage-v1', costInUsd: 0.0005 }),
      },
    },
  ])('asks the second model when the first $reason', async ({ firstAnswer }) => {
    const asked: string[] = [];
    const triage = createEscalatingTriage({
      first: firstAnswer,
      second: answering('claude-opus-5-5', 'system-update', 0.015, asked),
    });

    const outcome = await triage.propose(message);

    expect({ asked, outcome }).toEqual({
      asked: ['claude-opus-5-5:message-1'],
      outcome: expect.objectContaining({
        model: 'claude-opus-5-5',
        costInUsd: 0.0155,
        proposal: expect.objectContaining({ category: 'system-update' }) as unknown,
      }) as unknown,
    });
  });
});
