import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { noDueTimeText, TriagePage } from './triage-page';

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

  it('shows an unknown item in the action block', async () => {
    // The backend sends `unknown` items in the action list, next to `action` ones; there is no `unknown` group.
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-4',
          accountEmail: 'ana@example.com',
          action: 'keep',
          category: 'unknown',
          summary: 'A note from an unfamiliar sender about a pallet',
          extract: {},
          reason: 'Nothing in the message fits a known category',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const cards = within(actionBlock).getAllByRole('article');
    expect(cards).toHaveLength(1);
    expect(within(actionBlock).getByText(/A note from an unfamiliar sender about a pallet/)).toBeInTheDocument();
  });

  it('takes unknown items from the action list only and renders no unknown group button', async () => {
    const unknownItem = {
      messageId: 'message-9',
      accountEmail: 'ana@example.com',
      action: 'keep',
      category: 'unknown',
      summary: 'A forwarded note with no context',
      extract: {},
      reason: 'Nothing in the message fits a known category',
    };
    answerGetTriageQueueWith({
      action: [unknownItem],
      groups: [{ category: 'unknown', count: 1, items: [unknownItem] }],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    expect(within(actionBlock).getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /unknown/ })).not.toBeInTheDocument();
  });

  it('says an action card with no due time has none', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-5',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for the slides',
          extract: { asker: 'Luis Pérez', ask: 'Share the board slides' },
          reason: 'Luis asks the user directly',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    expect(within(card).getByText(noDueTimeText)).toBeInTheDocument();
  });

  it('shows each item with its reason, its account and a link to the message', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-6',
          accountEmail: 'franciscoc@psmutuus.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for the slides',
          extract: { asker: 'Luis Pérez', ask: 'Share the board slides' },
          reason: 'Luis asks the user directly',
          link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-6',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    expect(within(card).getByText(/Luis asks the user directly/)).toBeInTheDocument();
    expect(within(card).getByText(/franciscoc@psmutuus\.com/)).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-6',
    );
  });
  it('shows each category group collapsed with its count', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'expense',
          count: 2,
          items: [
            {
              messageId: 'message-7',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Receipt from Acme',
              extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
              reason: 'A receipt to file',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-7',
            },
            {
              messageId: 'message-8',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Invoice from Globex',
              extract: { vendor: 'Globex', amount: 900, currency: 'MXN', date: '2026-11-03' },
              reason: 'An invoice to file',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-8',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const groupToggle = await screen.findByRole('button', { name: /expense.*2/ });
    expect(groupToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Receipt from Acme/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Invoice from Globex/)).not.toBeInTheDocument();
  });

  it('lists the items of a group once it is expanded', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'expense',
          count: 2,
          items: [
            {
              messageId: 'message-10',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Receipt from Acme',
              extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
              reason: 'A receipt to file',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-10',
            },
            {
              messageId: 'message-11',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Invoice from Globex',
              extract: { vendor: 'Globex', amount: 900, currency: 'MXN', date: '2026-11-03' },
              reason: 'An invoice to file',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-11',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const groupToggle = await screen.findByRole('button', { name: /expense.*2/ });
    await user.click(groupToggle);

    expect(groupToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Receipt from Acme/)).toBeInTheDocument();
    expect(screen.getByText(/Invoice from Globex/)).toBeInTheDocument();
  });
});
