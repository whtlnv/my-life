import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TriagePage } from './triage-page';

const answerGetTriageQueueWith = (body: unknown) => {
  const fetchStub = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      input === '/triage-queue'
        ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
        : new Response(null, { status: 404 }),
    ),
  );
  vi.stubGlobal('fetch', fetchStub);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TriagePage', () => {
  it('shows the action block first, one card per item with who asks, what is asked and by when', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for a budget review',
          extract: { asker: 'Luis Pérez', ask: 'Review the Q4 budget', due: 'Friday 6 Nov' },
          reason: 'Luis asks the user directly',
        },
        {
          messageId: 'message-2',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Marta asks for the signed contract',
          extract: { asker: 'Marta Gil', ask: 'Send the signed contract', due: 'Tomorrow noon' },
          reason: 'Marta asks the user directly',
        },
      ],
      groups: [
        {
          category: 'expense',
          count: 1,
          items: [
            {
              messageId: 'message-3',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Receipt from Acme',
              extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
              reason: 'A receipt to file',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    expect(screen.getAllByRole('region')[0]).toBe(actionBlock);
    const cards = within(actionBlock).getAllByRole('article');
    expect(cards).toHaveLength(2);
    const [luisCard, martaCard] = cards as [HTMLElement, HTMLElement];
    expect(within(luisCard).getByText(/Luis Pérez/)).toBeInTheDocument();
    expect(within(luisCard).getByText(/Review the Q4 budget/)).toBeInTheDocument();
    expect(within(luisCard).getByText(/Friday 6 Nov/)).toBeInTheDocument();
    expect(within(martaCard).getByText(/Marta Gil/)).toBeInTheDocument();
    expect(within(martaCard).getByText(/Send the signed contract/)).toBeInTheDocument();
    expect(within(martaCard).getByText(/Tomorrow noon/)).toBeInTheDocument();
  });
});
