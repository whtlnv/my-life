import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { noDueTimeText, significantFlagText, TriagePage } from './triage-page';

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
  it('lists the items of an expanded system-update group under their sending system and flags a significant one', async () => {
    const systemUpdateItem = (messageId: string, summary: string, system: string, significant: boolean) => ({
      messageId,
      accountEmail: 'ana@example.com',
      action: 'archive',
      category: 'system-update',
      summary,
      extract: { system, severity: significant ? 'error' : 'info', significant },
      reason: 'An automated notification',
      link: `https://mail.google.com/mail/?authuser=ana%40example.com#all/${messageId}`,
    });
    const failedDeploy = systemUpdateItem('message-12', 'Deploy failed on main', 'GitHub', true);
    const mergedPullRequest = systemUpdateItem('message-13', 'Pull request merged', 'GitHub', false);
    const billingNotice = systemUpdateItem('message-14', 'Monthly bill is ready', 'AWS', false);
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'system-update',
          count: 3,
          items: [failedDeploy, mergedPullRequest, billingNotice],
          systems: [
            { system: 'GitHub', items: [failedDeploy, mergedPullRequest] },
            { system: 'AWS', items: [billingNotice] },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    await user.click(await screen.findByRole('button', { name: /system-update.*3/ }));

    const gitHub = screen.getByRole('region', { name: 'GitHub' });
    const aws = screen.getByRole('region', { name: 'AWS' });
    const [failedDeployCard, mergedPullRequestCard] = within(gitHub).getAllByRole('article') as [
      HTMLElement,
      HTMLElement,
    ];
    expect(within(gitHub).getAllByRole('article')).toHaveLength(2);
    expect(within(failedDeployCard).getByText(/Deploy failed on main/)).toBeInTheDocument();
    expect(within(failedDeployCard).getByText(significantFlagText)).toBeInTheDocument();
    expect(within(mergedPullRequestCard).getByText(/Pull request merged/)).toBeInTheDocument();
    expect(within(mergedPullRequestCard).queryByText(significantFlagText)).not.toBeInTheDocument();
    expect(within(aws).getAllByRole('article')).toHaveLength(1);
    expect(within(aws).getByText(/Monthly bill is ready/)).toBeInTheDocument();
  });
  it('shows the vendor, amount, currency and date of each item in an expanded expense group', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'expense',
          count: 1,
          items: [
            {
              messageId: 'message-15',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Receipt for office supplies',
              extract: { vendor: 'Papelería Lumen', amount: 345.5, currency: 'MXN', date: '2026-11-04' },
              reason: 'A receipt to file',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-15',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    await user.click(await screen.findByRole('button', { name: /expense.*1/ }));

    expect(screen.getByText(/Papelería Lumen/)).toBeInTheDocument();
    expect(screen.getByText(/345\.5/)).toBeInTheDocument();
    expect(screen.getByText(/MXN/)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-04/)).toBeInTheDocument();
  });
  it('shows the company, solution and the problem it solves of each item in an expanded sales group', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'sales',
          count: 1,
          items: [
            {
              messageId: 'message-16',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'sales',
              summary: 'Pitch for a scheduling assistant',
              extract: { company: 'Acme', solution: 'AI scheduling assistant', problem: 'Time lost coordinating meetings' },
              reason: 'A cold sales pitch',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-16',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    await user.click(await screen.findByRole('button', { name: /sales.*1/ }));

    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText(/AI scheduling assistant/)).toBeInTheDocument();
    expect(screen.getByText(/Time lost coordinating meetings/)).toBeInTheDocument();
  });
  it('confirms a focused action card as a task when `t` is pressed', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-17',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for the slides',
          extract: { asker: 'Luis Pérez', ask: 'Share the board slides' },
          reason: 'Luis asks the user directly',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-17',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('t');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'message-17', decision: 'confirmed' }),
      }),
    );
  });
  it('confirms a focused card whose proposal is `keep` when `k` is pressed', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-23',
          accountEmail: 'ana@example.com',
          action: 'keep',
          category: 'action',
          summary: 'Marta shares the quarterly numbers',
          extract: { asker: 'Marta Ruiz', ask: 'Review the quarterly numbers' },
          reason: 'Worth keeping for the board meeting',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-23',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('k');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'message-23', decision: 'confirmed' }),
      }),
    );
  });
  it('confirms a focused card whose proposal is `archive` when `a` is pressed', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-24',
          accountEmail: 'ana@example.com',
          action: 'archive',
          category: 'action',
          summary: 'Luis forwards an old newsletter',
          extract: { asker: 'Luis Gómez', ask: 'Read the newsletter' },
          reason: 'Nothing to do here',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-24',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('a');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'message-24', decision: 'confirmed' }),
      }),
    );
  });
  it('asks for a correction when `r` is pressed on a focused card and rejects it with the chosen correction', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-25',
          accountEmail: 'ana@example.com',
          action: 'archive',
          category: 'action',
          summary: 'Marta sends the signed lease',
          extract: { asker: 'Marta Ruiz', ask: 'File the signed lease' },
          reason: 'Looks like a document to file',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-25',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('r');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('k');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'message-25', decision: 'rejected', correction: { action: 'keep' } }),
      }),
    );
  });
  it('rejects a focused `keep` card with a correction to `act` and a task draft titled from its summary when `t` is pressed', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-26',
          accountEmail: 'ana@example.com',
          action: 'keep',
          category: 'action',
          summary: 'Marta asks to renew the domain',
          extract: { asker: 'Marta Ruiz', ask: 'Renew the domain' },
          reason: 'Looks informational',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-26',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('t');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messageId: 'message-26',
          decision: 'rejected',
          correction: { action: 'act', taskDraft: { title: 'Marta asks to renew the domain' } },
        }),
      }),
    );
  });
  it('rejects a focused `act` card with a correction to `archive` when `a` is pressed', async () => {
    answerGetTriageQueueWith({
      action: [
        {
          messageId: 'message-27',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis shares the conference recap',
          extract: { asker: 'Luis Gómez', ask: 'Read the recap' },
          reason: 'Asks for a read',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-27',
        },
      ],
      groups: [],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Action' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('a');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'message-27', decision: 'rejected', correction: { action: 'archive' } }),
      }),
    );
  });
});
