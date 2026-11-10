import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountName } from './account-name';
import { timeInBusinessZone } from './app-shell';
import { categoryLabel } from './category-labels';

import {
  channelLabels,
  fetchedAtText,
  noDueTimeText,
  nothingNeedsInputText,
  pausedNoticeText,
  remainingMessagesText,
  sectionTitles,
  severityCountText,
  significantFlagText,
  TriagePage,
} from './triage-page';

const answerGetTriageQueueWith = (body: unknown, acceptedPostPath?: string) => {
  const fetchStub = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      input === '/triage-queue'
        ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
        : input === acceptedPostPath
          ? new Response(null, { status: 201 })
          : new Response(null, { status: 404 }),
    ),
  );
  vi.stubGlobal('fetch', fetchStub);
};

const findCardContaining = async (text: string): Promise<HTMLElement> => {
  const card = (await screen.findByText(text)).closest('article');
  if (card === null) throw new Error(`"${text}" is not inside a card`);
  return card;
};

const queueOfActionItems = (action: unknown[]) => ({ action, groups: [], remaining: 0, paused: false });

const chatItem = (chatId: string, chatTitle: string, senderName: string, text: string) => ({
  channel: 'telegram',
  chatId,
  messageId: '42',
  chatTitle,
  senderName,
  text,
  time: '2026-11-09T16:00:00.000Z',
});

const handledItem = (messageId: string, summary: string) => ({
  messageId,
  accountEmail: 'francisco@psmutuus.com',
  action: 'archive',
  category: 'sales',
  summary,
  extract: {},
  reason: 'A sales pitch',
  link: `https://mail.google.com/mail/?authuser=francisco%40psmutuus.com#all/${messageId}`,
});

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

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
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
    answerGetTriageQueueWith(
      queueOfActionItems([
        {
          messageId: 'message-4',
          accountEmail: 'ana@example.com',
          action: 'keep',
          category: 'unknown',
          summary: 'A note from an unfamiliar sender about a pallet',
          extract: {},
          reason: 'Nothing in the message fits a known category',
        },
      ]),
    );

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
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

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    expect(within(actionBlock).getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Unknown/ })).not.toBeInTheDocument();
  });

  it('says an action card with no due time has none', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
        {
          messageId: 'message-5',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for the slides',
          extract: { asker: 'Luis Pérez', ask: 'Share the board slides' },
          reason: 'Luis asks the user directly',
        },
      ]),
    );

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    expect(within(card).getByText(noDueTimeText)).toBeInTheDocument();
  });

  it('shows each item with its reason, its account and a link to the message', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
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
      ]),
    );

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
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

    const groupToggle = await screen.findByRole('button', { name: /Expenses.*2/ });
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

    const groupToggle = await screen.findByRole('button', { name: /Expenses.*2/ });
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

    await user.click(await screen.findByRole('button', { name: /System updates.*3/ }));

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

    await user.click(await screen.findByRole('button', { name: /Expenses.*1/ }));

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
              extract: {
                company: 'Acme',
                solution: 'AI scheduling assistant',
                problem: 'Time lost coordinating meetings',
              },
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

    await user.click(await screen.findByRole('button', { name: /Sales pitches.*1/ }));

    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText(/AI scheduling assistant/)).toBeInTheDocument();
    expect(screen.getByText(/Time lost coordinating meetings/)).toBeInTheDocument();
  });
  it.each([
    {
      rule: 'action card as a task when `t` is pressed',
      key: 't',
      item: {
        messageId: 'message-17',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Luis asks for the slides',
        extract: { asker: 'Luis Pérez', ask: 'Share the board slides' },
        reason: 'Luis asks the user directly',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-17',
      },
    },
    {
      rule: 'card whose proposal is `keep` when `k` is pressed',
      key: 'k',
      item: {
        messageId: 'message-23',
        accountEmail: 'ana@example.com',
        action: 'keep',
        category: 'action',
        summary: 'Marta shares the quarterly numbers',
        extract: { asker: 'Marta Ruiz', ask: 'Review the quarterly numbers' },
        reason: 'Worth keeping for the board meeting',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-23',
      },
    },
    {
      rule: 'card whose proposal is `archive` when `a` is pressed',
      key: 'a',
      item: {
        messageId: 'message-24',
        accountEmail: 'ana@example.com',
        action: 'archive',
        category: 'action',
        summary: 'Luis forwards an old newsletter',
        extract: { asker: 'Luis Gómez', ask: 'Read the newsletter' },
        reason: 'Nothing to do here',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-24',
      },
    },
  ])('confirms a focused $rule', async ({ key, item }) => {
    answerGetTriageQueueWith(queueOfActionItems([item]));
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard(key);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: item.messageId, decision: 'confirmed' }),
      }),
    );
  });
  it('asks for a correction when `r` is pressed on a focused card and rejects it with the chosen correction', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
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
      ]),
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
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
  it.each([
    {
      rule: '`keep` card with a correction to `act` and a task draft titled from its summary when `t` is pressed',
      key: 't',
      item: {
        messageId: 'message-26',
        accountEmail: 'ana@example.com',
        action: 'keep',
        category: 'action',
        summary: 'Marta asks to renew the domain',
        extract: { asker: 'Marta Ruiz', ask: 'Renew the domain' },
        reason: 'Looks informational',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-26',
      },
      correction: { action: 'act', taskDraft: { title: 'Marta asks to renew the domain' } },
    },
    {
      rule: '`act` card with a correction to `archive` when `a` is pressed',
      key: 'a',
      item: {
        messageId: 'message-27',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Luis shares the conference recap',
        extract: { asker: 'Luis Gómez', ask: 'Read the recap' },
        reason: 'Asks for a read',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-27',
      },
      correction: { action: 'archive' },
    },
    {
      rule: '`act` card with a correction to `keep` when `k` is pressed',
      key: 'k',
      item: {
        messageId: 'message-28',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Marta forwards the board minutes',
        extract: { asker: 'Marta Ruiz', ask: 'Review the minutes' },
        reason: 'Asks for a review',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-28',
      },
      correction: { action: 'keep' },
    },
  ])('rejects a focused $rule', async ({ key, item, correction }) => {
    answerGetTriageQueueWith(queueOfActionItems([item]));
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard(key);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: item.messageId, decision: 'rejected', correction }),
      }),
    );
  });
  it('rejects with the category picked and the note typed in the correction prompt when Enter is pressed', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
        {
          messageId: 'message-29',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Acme sends the November invoice',
          extract: { asker: 'Acme billing', ask: 'Pay the invoice' },
          reason: 'Asks for a payment',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-29',
        },
      ]),
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('r');
    const prompt = screen.getByRole('dialog');
    await user.selectOptions(within(prompt).getByRole('combobox'), 'expense');
    await user.type(within(prompt).getByRole('textbox'), 'Invoices are expenses, not asks');
    await user.keyboard('{Enter}');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messageId: 'message-29',
          decision: 'rejected',
          correction: { category: 'expense', note: 'Invoices are expenses, not asks' },
        }),
      }),
    );
  });
  it('closes the correction prompt and posts nothing when Escape is pressed after picking a category and typing a note', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
        {
          messageId: 'message-30',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Acme sends the December invoice',
          extract: { asker: 'Acme billing', ask: 'Pay the invoice' },
          reason: 'Asks for a payment',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-30',
        },
      ]),
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(card);
    await user.keyboard('r');
    const prompt = screen.getByRole('dialog');
    await user.selectOptions(within(prompt).getByRole('combobox'), 'expense');
    await user.type(within(prompt).getByRole('textbox'), 'Invoices are expenses, not asks');
    await user.keyboard('{Escape}');

    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/verdicts', expect.anything());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    {
      rule: 'acts on the next card when ArrowDown moves focus there before a key is pressed',
      clicked: 0,
      keys: ['{ArrowDown}'],
      actedOn: 1,
      actedOnMessageId: 'message-32',
      otherMessageId: 'message-31',
    },
    {
      rule: 'acts on the previous card when ArrowUp moves focus there, and stays on the first card when pressed again',
      clicked: 1,
      keys: ['{ArrowUp}', '{ArrowUp}'],
      actedOn: 0,
      actedOnMessageId: 'message-31',
      otherMessageId: 'message-32',
    },
    {
      rule: 'keeps focus on the last card when ArrowDown is pressed there, so a key still acts on it',
      clicked: 1,
      keys: ['{ArrowDown}'],
      actedOn: 1,
      actedOnMessageId: 'message-32',
      otherMessageId: 'message-31',
    },
  ] as const)('$rule', async ({ clicked, keys, actedOn, actedOnMessageId, otherMessageId }) => {
    const items = [
      {
        messageId: 'message-31',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Luis asks for the slides',
        extract: { asker: 'Luis Pérez', ask: 'Share the board slides' },
        reason: 'Luis asks the user directly',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-31',
      },
      {
        messageId: 'message-32',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Marta asks for the signed contract',
        extract: { asker: 'Marta Gil', ask: 'Send the signed contract' },
        reason: 'Marta asks the user directly',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-32',
      },
    ];
    answerGetTriageQueueWith(queueOfActionItems(items));
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const cards = within(actionBlock).getAllByRole('article') as [HTMLElement, HTMLElement];
    await user.click(cards[clicked]);
    for (const key of keys) {
      await user.keyboard(key);
    }
    await user.keyboard('t');

    expect(cards[actedOn]).toHaveFocus();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({ body: JSON.stringify({ messageId: actedOnMessageId, decision: 'confirmed' }) }),
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      '/verdicts',
      expect.objectContaining({ body: JSON.stringify({ messageId: otherMessageId, decision: 'confirmed' }) }),
    );
  });

  it('confirms only the focused group when the confirm-all key `c` is pressed on it', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'expense',
          count: 1,
          items: [
            {
              messageId: 'message-37',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Receipt from Acme',
              extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
              reason: 'A receipt to file',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-37',
            },
          ],
        },
        {
          category: 'sales',
          count: 1,
          items: [
            {
              messageId: 'message-38',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'sales',
              summary: 'Initech pitches a CRM',
              extract: { company: 'Initech', solution: 'A CRM', problem: 'Lost leads' },
              reason: 'A cold sales pitch',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-38',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const expenseToggle = await screen.findByRole('button', { name: /Expenses.*1/ });
    expenseToggle.focus();
    await user.keyboard('c');

    const groupVerdictBodies = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/group-verdicts')
      .map(([, init]) => init?.body);
    expect(groupVerdictBodies).toEqual([JSON.stringify({ category: 'expense', decision: 'confirmed' })]);
  });

  it('removes a card from the page once the backend accepts its verdict, and keeps the others', async () => {
    const queue = queueOfActionItems([
      {
        messageId: 'message-39',
        accountEmail: 'ana@example.com',
        action: 'archive',
        category: 'action',
        summary: 'Luis forwards an old newsletter',
        extract: { asker: 'Luis Gómez', ask: 'Read the newsletter' },
        reason: 'Nothing to do here',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-39',
      },
      {
        messageId: 'message-40',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Marta asks for the signed contract',
        extract: { asker: 'Marta Gil', ask: 'Send the signed contract' },
        reason: 'Marta asks the user directly',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-40',
      },
    ]);
    answerGetTriageQueueWith(queue, '/verdicts');
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [luisCard] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(luisCard);
    await user.keyboard('a');

    await waitFor(() => {
      expect(within(actionBlock).queryByText('Luis forwards an old newsletter')).not.toBeInTheDocument();
    });
    expect(within(actionBlock).getByText('Marta asks for the signed contract')).toBeInTheDocument();
  });

  it('removes a card from the page once the backend accepts the correction its key posts', async () => {
    const queue = queueOfActionItems([
      {
        messageId: 'message-41',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Pedro shares the lunch menu',
        extract: { asker: 'Pedro Ruiz', ask: 'Pick a dish' },
        reason: 'Pedro asks the user directly',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-41',
      },
    ]);
    answerGetTriageQueueWith(queue, '/verdicts');
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    await user.click(within(actionBlock).getByRole('article'));
    await user.keyboard('a');

    await waitFor(() => {
      expect(within(actionBlock).queryByText('Pedro shares the lunch menu')).not.toBeInTheDocument();
    });
  });

  it('removes a card from the page once the backend accepts the rejection posted from the correction prompt', async () => {
    const queue = queueOfActionItems([
      {
        messageId: 'message-42',
        accountEmail: 'ana@example.com',
        action: 'act',
        category: 'action',
        summary: 'Acme sends the January invoice',
        extract: { asker: 'Acme billing', ask: 'Pay the invoice' },
        reason: 'Asks for a payment',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-42',
      },
    ]);
    answerGetTriageQueueWith(queue, '/verdicts');
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    await user.click(within(actionBlock).getByRole('article'));
    await user.keyboard('r');
    const prompt = screen.getByRole('dialog');
    await user.selectOptions(within(prompt).getByRole('combobox'), 'expense');
    await user.type(within(prompt).getByRole('textbox'), 'Invoices are expenses, not asks');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(within(actionBlock).queryByText('Acme sends the January invoice')).not.toBeInTheDocument();
    });
  });

  it('removes a group from the page once the backend accepts its confirm-all, and keeps the other groups', async () => {
    const queue = {
      action: [],
      groups: [
        {
          category: 'expense',
          count: 1,
          items: [
            {
              messageId: 'message-37',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'expense',
              summary: 'Receipt from Acme',
              extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
              reason: 'A receipt to file',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-37',
            },
          ],
        },
        {
          category: 'sales',
          count: 1,
          items: [
            {
              messageId: 'message-38',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'sales',
              summary: 'Initech pitches a CRM',
              extract: { company: 'Initech', solution: 'A CRM', problem: 'Lost leads' },
              reason: 'A cold sales pitch',
              link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-38',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    };
    answerGetTriageQueueWith(queue, '/group-verdicts');
    const user = userEvent.setup();

    render(<TriagePage />);

    const expenseToggle = await screen.findByRole('button', { name: /Expenses.*1/ });
    expenseToggle.focus();
    await user.keyboard('c');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Expenses.*1/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Sales pitches.*1/ })).toBeInTheDocument();
  });

  it('shows how many messages remain to be triaged', async () => {
    answerGetTriageQueueWith({ action: [], groups: [], remaining: 7, paused: false });

    render(<TriagePage />);

    expect(await screen.findByText(remainingMessagesText(7))).toBeInTheDocument();
  });

  it('says so when the ceiling paused triage', async () => {
    answerGetTriageQueueWith({ action: [], groups: [], remaining: 3, paused: true });

    render(<TriagePage />);

    expect(await screen.findByText(pausedNoticeText)).toBeInTheDocument();
  });

  it('shows no paused notice when triage is not paused', async () => {
    answerGetTriageQueueWith({ action: [], groups: [], remaining: 3, paused: false });

    render(<TriagePage />);

    expect(await screen.findByText(remainingMessagesText(3))).toBeInTheDocument();
    expect(screen.queryByText(pausedNoticeText)).not.toBeInTheDocument();
  });

  it('says when the queue was fetched', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      remaining: 0,
      paused: false,
      fetchedAt: '2026-11-07T15:05:00.000Z',
    });

    render(<TriagePage />);

    expect(await screen.findByText(fetchedAtText('2026-11-07T15:05:00.000Z'))).toBeInTheDocument();
  });
  it('rejects an `act` card with a correction to `archive` when its Archive button is clicked, and removes it once accepted', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for a budget review',
          extract: { asker: 'Luis Pérez', ask: 'Review the Q4 budget' },
          reason: 'Luis asks the user directly',
        },
      ]),
      '/verdicts',
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [card] = within(actionBlock).getAllByRole('article') as [HTMLElement];
    await user.click(within(card).getByRole('button', { name: /archive/i }));

    expect(fetch).toHaveBeenCalledWith('/verdicts', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'message-1', decision: 'rejected', correction: { action: 'archive' } }),
    });
    await waitFor(() => {
      expect(within(actionBlock).queryAllByRole('article')).toHaveLength(0);
    });
  });
  it('opens the correction prompt when the Recategorize button is clicked', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          action: 'keep',
          category: 'unknown',
          summary: 'A note about a pallet',
          extract: {},
          reason: 'No context',
        },
      ]),
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    await user.click(within(actionBlock).getByRole('button', { name: /recategorize/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('lists an expanded calendar-drive group as one line per item with what changed, and a cc-thread group with what happened since the last message', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'calendar-drive',
          count: 1,
          items: [
            {
              messageId: 'message-20',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'calendar-drive',
              summary: 'Board prep moved',
              extract: { item: 'Board prep with Marta', change: 'Moved 30 minutes later' },
              reason: 'The calendar already shows it',
            },
          ],
        },
        {
          category: 'cc-thread',
          count: 1,
          items: [
            {
              messageId: 'message-21',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'cc-thread',
              summary: 'Launch checklist thread',
              extract: { sinceLastMessage: 'Legal cleared the copy; launch moved to the 14th' },
              reason: 'Nobody asks you anything',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    await user.click(await screen.findByRole('button', { name: /Calendar & Drive.*1/ }));
    await user.click(screen.getByRole('button', { name: /Cc threads.*1/ }));

    expect(screen.getByText('Board prep with Marta')).toBeInTheDocument();
    expect(screen.getByText('Moved 30 minutes later')).toBeInTheDocument();
    expect(screen.getByText('Launch checklist thread')).toBeInTheDocument();
    expect(screen.getByText(/Legal cleared the copy/)).toBeInTheDocument();
  });
  it('summarizes what a group proposes: all one action, or a count per action when they differ', async () => {
    const systemUpdate = (messageId: string, action: string) => ({
      messageId,
      accountEmail: 'ana@example.com',
      action,
      category: 'system-update',
      summary: `Update ${messageId}`,
      extract: { system: 'AWS', severity: 'info', significant: false },
      reason: 'Routine',
    });
    answerGetTriageQueueWith({
      action: [],
      groups: [
        {
          category: 'system-update',
          count: 3,
          items: [systemUpdate('m-1', 'keep'), systemUpdate('m-2', 'archive'), systemUpdate('m-3', 'archive')],
        },
        {
          category: 'sales',
          count: 1,
          items: [
            {
              messageId: 'm-4',
              accountEmail: 'ana@example.com',
              action: 'archive',
              category: 'sales',
              summary: 'A pitch',
              extract: { company: 'Acme', solution: 'Thing', problem: 'Pain' },
              reason: 'Cold outreach',
            },
          ],
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    expect(await screen.findByRole('button', { name: /System updates.*3.*1 keep · 2 archive/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sales pitches.*1.*all archive/ })).toBeInTheDocument();
  });
  it('says so when nothing needs the user and no group is waiting', async () => {
    answerGetTriageQueueWith({ action: [], groups: [], remaining: 0, paused: false });

    render(<TriagePage />);

    expect(await screen.findByText(/Nothing needs you/)).toBeInTheDocument();
    expect(screen.getByText(/No groups waiting/)).toBeInTheDocument();
  });
  it('rejects a `keep` card with a correction to a task when its Task button is clicked, and keeps an `act` card when its Keep button is clicked', async () => {
    answerGetTriageQueueWith(
      queueOfActionItems([
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          action: 'keep',
          category: 'unknown',
          summary: 'A note about a pallet',
          extract: {},
          reason: 'No context',
        },
        {
          messageId: 'message-2',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Marta asks for the signed contract',
          extract: { asker: 'Marta Gil', ask: 'Send the signed contract' },
          reason: 'Marta asks the user directly',
        },
      ]),
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const actionBlock = await screen.findByRole('region', { name: 'Needs you' });
    const [palletCard, martaCard] = within(actionBlock).getAllByRole('article') as [HTMLElement, HTMLElement];
    await user.click(within(palletCard).getByRole('button', { name: /task/i }));
    await user.click(within(martaCard).getByRole('button', { name: /keep/i }));

    expect(fetch).toHaveBeenCalledWith('/verdicts', {
      method: 'POST',
      body: JSON.stringify({
        messageId: 'message-1',
        decision: 'rejected',
        correction: { action: 'act', taskDraft: { title: 'A note about a pallet' } },
      }),
    });
    expect(fetch).toHaveBeenCalledWith('/verdicts', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'message-2', decision: 'rejected', correction: { action: 'keep' } }),
    });
  });
  it('renders nothing, without throwing, while the queue cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connection refused'))),
    );

    const { container } = render(<TriagePage />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/triage-queue');
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows its sections in the order Needs you, digests, Needs input, Handled for you', async () => {
    answerGetTriageQueueWith({ action: [], groups: [], digests: [], handledForYou: [], remaining: 0, paused: false });

    render(<TriagePage />);

    await screen.findByRole('region', { name: sectionTitles.needsYou });
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      sectionTitles.needsYou,
      sectionTitles.digests,
      sectionTitles.needsInput,
      sectionTitles.handledForYou,
    ]);
  });

  it('says nothing needs input when the Needs input section is empty', async () => {
    answerGetTriageQueueWith({ action: [], groups: [], digests: [], handledForYou: [], remaining: 0, paused: false });

    render(<TriagePage />);

    const needsInput = await screen.findByRole('region', { name: sectionTitles.needsInput });
    expect(within(needsInput).getByText(nothingNeedsInputText)).toBeInTheDocument();
  });

  it('shows on a digest card its summary lines and its count by severity', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      digests: [
        {
          id: 'digest-1',
          accountEmail: 'francisco@psmutuus.com',
          category: 'system-update',
          key: 'GitHub',
          count: 3,
          severityCounts: { high: 2, low: 1 },
          summaryLines: ['Two failed deploys on main', 'One dependency alert'],
          significantItems: [],
        },
      ],
      handledForYou: [],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const digestsSection = await screen.findByRole('region', { name: sectionTitles.digests });
    expect(within(digestsSection).getByText('Two failed deploys on main')).toBeInTheDocument();
    expect(within(digestsSection).getByText('One dependency alert')).toBeInTheDocument();
    expect(within(digestsSection).getByText(severityCountText('high', 2))).toBeInTheDocument();
    expect(within(digestsSection).getByText(severityCountText('low', 1))).toBeInTheDocument();
  });

  it('lists on a digest card its significant items, each linked to its message and naming its account', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      digests: [
        {
          id: 'digest-1',
          accountEmail: 'francisco@psmutuus.com',
          category: 'system-update',
          key: 'GitHub',
          count: 3,
          severityCounts: { high: 1 },
          summaryLines: ['One failed deploy on main'],
          significantItems: [
            {
              messageId: 'message-9',
              summary: 'Deploy to production failed',
              accountEmail: 'francisco@erlia.com',
              link: 'https://mail.google.com/mail/?authuser=francisco%40erlia.com#all/message-9',
            },
          ],
        },
      ],
      handledForYou: [],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const digestsSection = await screen.findByRole('region', { name: sectionTitles.digests });
    const item = within(digestsSection).getByRole('listitem');
    expect(within(item).getByRole('link', { name: /Deploy to production failed/ })).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/?authuser=francisco%40erlia.com#all/message-9',
    );
    expect(within(item).getByText(accountName('francisco@erlia.com'))).toBeInTheDocument();
  });

  it('posts the confirm for only the digest whose Confirm button is clicked, and removes that card once accepted', async () => {
    const confirmedDigestId = JSON.stringify(['francisco@psmutuus.com', 'system-update', 'GitHub', 'message-1']);
    const otherDigestId = JSON.stringify(['francisco@psmutuus.com', 'sales', 'sales@initech.com', 'message-2']);
    const digest = (id: string, summaryLine: string) => ({
      id,
      accountEmail: 'francisco@psmutuus.com',
      category: 'system-update',
      key: 'GitHub',
      count: 1,
      severityCounts: {},
      summaryLines: [summaryLine],
      significantItems: [],
    });
    answerGetTriageQueueWith(
      {
        action: [],
        groups: [],
        digests: [digest(confirmedDigestId, 'Two failed deploys on main'), digest(otherDigestId, 'Initech pitches')],
        handledForYou: [],
        remaining: 0,
        paused: false,
      },
      `/digests/${encodeURIComponent(confirmedDigestId)}/confirmation`,
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const digestsSection = await screen.findByRole('region', { name: sectionTitles.digests });
    const confirmedCard = within(digestsSection).getByText('Two failed deploys on main').closest('article');
    if (!confirmedCard) throw new Error('the digest card is not an article');
    await user.click(within(confirmedCard).getByRole('button', { name: /Confirm/ }));

    await waitFor(() => {
      expect(within(digestsSection).queryByText('Two failed deploys on main')).not.toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(`/digests/${encodeURIComponent(confirmedDigestId)}/confirmation`, {
      method: 'POST',
    });
    expect(fetch).not.toHaveBeenCalledWith(
      `/digests/${encodeURIComponent(otherDigestId)}/confirmation`,
      expect.anything(),
    );
    expect(within(digestsSection).getByText('Initech pitches')).toBeInTheDocument();
  });

  it('shows Handled for you collapsed with how many items it holds', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      digests: [],
      handledForYou: [
        handledItem('message-1', 'Initech pitches a CRM'),
        handledItem('message-2', 'Globex pitches a webinar'),
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const handledSection = await screen.findByRole('region', { name: sectionTitles.handledForYou });
    const toggle = await within(handledSection).findByRole('button', {
      name: new RegExp(`${sectionTitles.handledForYou}.*2`),
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(handledSection).queryByText(/Initech pitches a CRM/)).not.toBeInTheDocument();
    expect(within(handledSection).queryByText(/Globex pitches a webinar/)).not.toBeInTheDocument();
  });

  it('lists each handled item with its summary, category and account once Handled for you is expanded', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      digests: [],
      handledForYou: [
        {
          messageId: 'message-1',
          accountEmail: 'francisco@psmutuus.com',
          action: 'archive',
          category: 'sales',
          summary: 'Initech pitches a CRM',
          extract: {},
          reason: 'A sales pitch',
          link: 'https://mail.google.com/mail/?authuser=francisco%40psmutuus.com#all/message-1',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const handledSection = await screen.findByRole('region', { name: sectionTitles.handledForYou });
    await user.click(
      await within(handledSection).findByRole('button', { name: new RegExp(sectionTitles.handledForYou) }),
    );
    const handledRow = (await within(handledSection).findByText('Initech pitches a CRM')).closest('li');
    if (handledRow === null) throw new Error('the handled item is not rendered as a list item');
    expect(within(handledRow).getByText(categoryLabel('sales'))).toBeInTheDocument();
    expect(within(handledRow).getByText(accountName('francisco@psmutuus.com'))).toBeInTheDocument();
  });

  it('posts the undo for only the handled item whose Undo button is clicked, and removes it from the list once accepted', async () => {
    answerGetTriageQueueWith(
      {
        action: [],
        groups: [],
        digests: [],
        handledForYou: [
          handledItem('message-1', 'Initech pitches a CRM'),
          handledItem('message-2', 'Globex pitches a webinar'),
        ],
        remaining: 0,
        paused: false,
      },
      '/handled-for-you/message-1/undo',
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const handledSection = await screen.findByRole('region', { name: sectionTitles.handledForYou });
    await user.click(
      await within(handledSection).findByRole('button', { name: new RegExp(sectionTitles.handledForYou) }),
    );
    const undoneRow = (await within(handledSection).findByText('Initech pitches a CRM')).closest('li');
    if (undoneRow === null) throw new Error('the handled item is not rendered as a list item');
    await user.click(within(undoneRow).getByRole('button', { name: /Undo/ }));

    await waitFor(() => {
      expect(within(handledSection).queryByText('Initech pitches a CRM')).not.toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith('/handled-for-you/message-1/undo', expect.objectContaining({ method: 'POST' }));
    expect(fetch).not.toHaveBeenCalledWith('/handled-for-you/message-2/undo', expect.anything());
    expect(within(handledSection).getByText('Globex pitches a webinar')).toBeInTheDocument();
  });

  it('shows Slack items in their own group, one card per item with its sender, workspace and text', async () => {
    const slackItem = (timestamp: string, senderName: string, workspaceTeamId: string, text: string) => ({
      workspaceTeamId,
      conversationId: 'D0001',
      senderUserId: `U-${senderName}`,
      senderName,
      text,
      timestamp,
      permalink: `https://app.slack.com/client/${workspaceTeamId}/D0001/p${timestamp.replace('.', '')}`,
      choices: ['ignore', 'act', 'reply'],
    });
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        slackItem('1762700000.000100', 'Lucía Ramos', 'T0001', 'Can you review the deck before Friday?'),
        slackItem('1762700100.000200', 'Diego Soto', 'T0002', 'The deploy is blocked on your approval'),
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    expect(sectionTitles).toHaveProperty('slack', expect.any(String));
    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const cards = within(slackSection).getAllByRole('article');
    expect(cards).toHaveLength(2);
    const [luciaCard, diegoCard] = cards as [HTMLElement, HTMLElement];
    expect(within(luciaCard).getByText(/Lucía Ramos/)).toBeInTheDocument();
    expect(within(luciaCard).getByText(/T0001/)).toBeInTheDocument();
    expect(within(luciaCard).getByText(/Can you review the deck before Friday\?/)).toBeInTheDocument();
    expect(within(diegoCard).getByText(/Diego Soto/)).toBeInTheDocument();
    expect(within(diegoCard).getByText(/T0002/)).toBeInTheDocument();
    expect(within(diegoCard).getByText(/The deploy is blocked on your approval/)).toBeInTheDocument();
  });

  it("shows on a Slack card its workspace's name and the time the message was sent", async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          workspaceName: 'Acme Studio',
          conversationId: 'D0001',
          senderUserId: 'U0001',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://acme-studio.slack.com/archives/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    expect(within(card).getByText('Acme Studio')).toBeInTheDocument();
    expect(within(card).getByText(timeInBusinessZone('2025-11-09T14:53:20.000Z'))).toBeInTheDocument();
    expect(card).not.toHaveTextContent('T0001');
  });

  it('posts the `ignore` verdict when the ignore key `i` is pressed on a Slack card, and the `act` verdict when the act key `t` is pressed on another', async () => {
    const slackItem = (timestamp: string, senderName: string, text: string) => ({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: `U-${senderName}`,
      senderName,
      text,
      timestamp,
      permalink: `https://app.slack.com/client/T0001/D0001/p${timestamp.replace('.', '')}`,
      choices: ['ignore', 'act', 'reply'],
    });
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        slackItem('1762700000.000100', 'Lucía Ramos', 'Lunch is moved to Thursday'),
        slackItem('1762700100.000200', 'Diego Soto', 'The deploy is blocked on your approval'),
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const [luciaCard, diegoCard] = within(slackSection).getAllByRole('article') as [HTMLElement, HTMLElement];
    await user.click(luciaCard);
    await user.keyboard('i');
    await user.click(diegoCard);
    await user.keyboard('t');

    const postedSlackVerdicts = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/slack-verdicts')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedSlackVerdicts).toEqual([
      {
        method: 'POST',
        body: { workspaceTeamId: 'T0001', conversationId: 'D0001', timestamp: '1762700000.000100', decision: 'ignore' },
      },
      {
        method: 'POST',
        body: { workspaceTeamId: 'T0001', conversationId: 'D0001', timestamp: '1762700100.000200', decision: 'act' },
      },
    ]);
  });
  it('posts no Slack verdict when a key other than the ignore, act and reply keys is pressed on a Slack card', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: 'Lunch is moved to Thursday',
          timestamp: '1762700000.000100',
          permalink: 'https://app.slack.com/client/T0001/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    await user.click(card);
    await user.keyboard('x');

    expect(fetch).not.toHaveBeenCalledWith('/slack-verdicts', expect.anything());
  });
  it('opens a composer when the reply key `r` is pressed on a Slack card, and its Send posts the typed text as an explicit send to that conversation', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://app.slack.com/client/T0001/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    await user.click(card);
    await user.keyboard('r');
    const composer = within(card).getByRole('textbox');
    await user.type(composer, 'Yes, I will send comments tomorrow');
    await user.click(within(card).getByRole('button', { name: 'Send' }));

    const postedSlackSends = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/slack-sends')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedSlackSends).toEqual([
      {
        method: 'POST',
        body: expect.objectContaining({
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          text: 'Yes, I will send comments tomorrow',
        }) as unknown,
      },
    ]);
    expect(fetch).not.toHaveBeenCalledWith('/slack-verdicts', expect.anything());
  });
  it("keeps the Slack composer's Send disabled while the reply text is empty", async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://app.slack.com/client/T0001/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    await user.click(card);
    await user.keyboard('r');

    expect(within(card).getByRole('button', { name: 'Send' })).toBeDisabled();
  });
  it('posts a reply composed on a Slack channel mention that starts no thread into a thread on that message', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'C0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: '<@U0000> can you look at the launch checklist?',
          timestamp: '1762700000.000200',
          permalink: 'https://app.slack.com/client/T0001/C0001/p1762700000000200',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    await user.click(card);
    await user.keyboard('r');
    await user.type(within(card).getByRole('textbox'), 'On it');
    await user.click(within(card).getByRole('button', { name: 'Send' }));

    const postedSlackSendBodies = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/slack-sends')
      .map(([, init]) => JSON.parse(init?.body as string) as unknown);
    expect(postedSlackSendBodies).toEqual([
      { workspaceTeamId: 'T0001', conversationId: 'C0001', threadTimestamp: '1762700000.000200', text: 'On it' },
    ]);
  });
  it('links a Slack card to its Slack permalink', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://acme.slack.com/archives/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    expect(within(card).getByRole('link')).toHaveAttribute(
      'href',
      'https://acme.slack.com/archives/D0001/p1762700000000100',
    );
  });

  it('gives a Slack card Ignore, Task and Reply buttons, each labelled with its key `i`, `t` and `r`', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://acme.slack.com/archives/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    const buttonKeys = within(card)
      .getAllByRole('button')
      .map((button) => [
        button.textContent.replace(button.querySelector('kbd')?.textContent ?? '', '').trim(),
        button.querySelector('kbd')?.textContent,
      ]);
    expect(buttonKeys).toEqual([
      ['Ignore', 'i'],
      ['Task', 't'],
      ['Reply', 'r'],
    ]);
  });

  it("posts the `ignore` verdict when a Slack card's Ignore button is clicked, and the `act` verdict when another card's Task button is clicked", async () => {
    const slackItem = (timestamp: string, senderName: string, text: string) => ({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: `U-${senderName}`,
      senderName,
      text,
      timestamp,
      permalink: `https://acme.slack.com/archives/D0001/p${timestamp.replace('.', '')}`,
      choices: ['ignore', 'act', 'reply'],
    });
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        slackItem('1762700000.000100', 'Lucía Ramos', 'Lunch is moved to Thursday'),
        slackItem('1762700100.000200', 'Diego Soto', 'The deploy is blocked on your approval'),
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const [luciaCard, diegoCard] = within(slackSection).getAllByRole('article') as [HTMLElement, HTMLElement];
    await user.click(within(luciaCard).getByRole('button', { name: /^Ignore/ }));
    await user.click(within(diegoCard).getByRole('button', { name: /^Task/ }));

    const postedSlackVerdicts = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/slack-verdicts')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedSlackVerdicts).toEqual([
      {
        method: 'POST',
        body: { workspaceTeamId: 'T0001', conversationId: 'D0001', timestamp: '1762700000.000100', decision: 'ignore' },
      },
      {
        method: 'POST',
        body: { workspaceTeamId: 'T0001', conversationId: 'D0001', timestamp: '1762700100.000200', decision: 'act' },
      },
    ]);
  });

  it("opens the composer when a Slack card's Reply button is clicked", async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://acme.slack.com/archives/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    await user.click(within(card).getByRole('button', { name: /^Reply/ }));

    expect(within(card).getByRole('textbox')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith('/slack-verdicts', expect.anything());
  });

  it('removes a Slack card from the page once the backend accepts its verdict, and keeps the others', async () => {
    const slackItem = (timestamp: string, senderName: string, text: string) => ({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: `U-${senderName}`,
      senderName,
      text,
      timestamp,
      permalink: `https://acme.slack.com/archives/D0001/p${timestamp.replace('.', '')}`,
      choices: ['ignore', 'act', 'reply'],
    });
    answerGetTriageQueueWith(
      {
        action: [],
        groups: [],
        slackItems: [
          slackItem('1762700000.000100', 'Lucía Ramos', 'Lunch is moved to Thursday'),
          slackItem('1762700100.000200', 'Diego Soto', 'The deploy is blocked on your approval'),
        ],
        remaining: 0,
        paused: false,
      },
      '/slack-verdicts',
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const [luciaCard] = within(slackSection).getAllByRole('article') as [HTMLElement];
    await user.click(within(luciaCard).getByRole('button', { name: /^Ignore/ }));

    await waitFor(() => {
      expect(within(slackSection).queryByText('Lunch is moved to Thursday')).not.toBeInTheDocument();
    });
    expect(within(slackSection).getByText('The deploy is blocked on your approval')).toBeInTheDocument();
  });

  it('removes a Slack card from the page once the backend accepts a reply sent from its composer, and keeps the others', async () => {
    const slackItem = (timestamp: string, senderName: string, text: string) => ({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: `U-${senderName}`,
      senderName,
      text,
      timestamp,
      permalink: `https://acme.slack.com/archives/D0001/p${timestamp.replace('.', '')}`,
      choices: ['ignore', 'act', 'reply'],
    });
    answerGetTriageQueueWith(
      {
        action: [],
        groups: [],
        slackItems: [
          slackItem('1762700000.000100', 'Lucía Ramos', 'Can you review the deck before Friday?'),
          slackItem('1762700100.000200', 'Diego Soto', 'The deploy is blocked on your approval'),
        ],
        remaining: 0,
        paused: false,
      },
      '/slack-sends',
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const [luciaCard] = within(slackSection).getAllByRole('article') as [HTMLElement];
    await user.click(within(luciaCard).getByRole('button', { name: /^Reply/ }));
    await user.type(within(luciaCard).getByRole('textbox'), 'Yes, I will send comments tomorrow');
    await user.click(within(luciaCard).getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(within(slackSection).queryByText('Can you review the deck before Friday?')).not.toBeInTheDocument();
    });
    expect(within(slackSection).getByText('The deploy is blocked on your approval')).toBeInTheDocument();
  });

  it('keeps the Slack composer open with the Slack error shown when Slack rejects the reply sent from it', async () => {
    const queue = {
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U0001',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://acme.slack.com/archives/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      remaining: 0,
      paused: false,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          input === '/triage-queue'
            ? new Response(JSON.stringify(queue), { headers: { 'content-type': 'application/json' } })
            : input === '/slack-sends'
              ? new Response(JSON.stringify({ error: 'channel_not_found' }), {
                  status: 502,
                  headers: { 'content-type': 'application/json' },
                })
              : new Response(null, { status: 404 }),
        ),
      ),
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const card = within(slackSection).getByRole('article');
    await user.click(within(card).getByRole('button', { name: /^Reply/ }));
    await user.type(within(card).getByRole('textbox'), 'Yes, I will send comments tomorrow');
    await user.click(within(card).getByRole('button', { name: 'Send' }));

    expect(await within(card).findByText(/channel_not_found/)).toBeInTheDocument();
    expect(within(card).getByRole('textbox')).toHaveValue('Yes, I will send comments tomorrow');
    expect(within(card).getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('removes a Slack card from the page once the backend accepts a Task verdict given with its button or the `t` key, and keeps the others', async () => {
    const slackItem = (timestamp: string, senderName: string, text: string) => ({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: `U-${senderName}`,
      senderName,
      text,
      timestamp,
      permalink: `https://acme.slack.com/archives/D0001/p${timestamp.replace('.', '')}`,
      choices: ['ignore', 'act', 'reply'],
    });
    answerGetTriageQueueWith(
      {
        action: [],
        groups: [],
        slackItems: [
          slackItem('1762700000.000100', 'Lucía Ramos', 'Can you review the deck before Friday?'),
          slackItem('1762700100.000200', 'Diego Soto', 'The deploy is blocked on your approval'),
          slackItem('1762700200.000300', 'Ana Ruiz', 'Lunch is moved to Thursday'),
        ],
        remaining: 0,
        paused: false,
      },
      '/slack-verdicts',
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const [luciaCard, diegoCard] = within(slackSection).getAllByRole('article') as [HTMLElement, HTMLElement];
    await user.click(within(luciaCard).getByRole('button', { name: /^Task/ }));
    await user.click(diegoCard);
    await user.keyboard('t');

    await waitFor(() => {
      expect(within(slackSection).queryByText('Can you review the deck before Friday?')).not.toBeInTheDocument();
      expect(within(slackSection).queryByText('The deploy is blocked on your approval')).not.toBeInTheDocument();
    });
    expect(within(slackSection).getByText('Lunch is moved to Thursday')).toBeInTheDocument();
  });

  it('shows a Telegram triage card with its chat title, sender, time and a Telegram channel pill', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const telegramCard = await findCardContaining('Familia Romero');
    expect(within(telegramCard).getByText('Lucía Romero')).toBeInTheDocument();
    expect(within(telegramCard).getByText(timeInBusinessZone('2026-11-09T16:00:00.000Z'))).toBeInTheDocument();
    expect(within(telegramCard).getByText(channelLabels.telegram)).toHaveClass('pill');
  });

  it('names the person once on a private-chat Telegram card', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7002',
          messageId: '43',
          chatTitle: 'Valeria Núñez',
          senderName: 'Valeria Núñez',
          text: '¿Firmaste el contrato?',
          time: '2026-11-09T16:00:00.000Z',
          link: 'https://web.telegram.org/k/#7002',
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const telegramCard = await findCardContaining('¿Firmaste el contrato?');
    expect(within(telegramCard).getAllByText('Valeria Núñez')).toHaveLength(1);
  });

  it('puts Telegram cards under a Telegram section heading, each with an Open in Telegram link to its chat', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          text: '¿Vienes a cenar el sábado?',
          time: '2026-11-09T16:00:00.000Z',
          link: 'https://web.telegram.org/k/#7001',
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const telegramSection = await screen.findByRole('region', { name: channelLabels.telegram });
    expect(within(telegramSection).getByRole('heading', { name: channelLabels.telegram })).toBeInTheDocument();
    const card = within(telegramSection).getByRole('article');
    expect(within(card).getByRole('link', { name: new RegExp(`Open in ${channelLabels.telegram}`) })).toHaveAttribute(
      'href',
      'https://web.telegram.org/k/#7001',
    );
  });

  it('shows the message text on a Telegram triage card', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          text: '¿Vienes a cenar el sábado?',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });

    render(<TriagePage />);

    const telegramCard = await findCardContaining('Familia Romero');
    expect(within(telegramCard).getByText('¿Vienes a cenar el sábado?')).toBeInTheDocument();
  });

  it('posts the `ignore` verdict for its message when the ignore key `i` is pressed on a Telegram card', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    await user.click(await findCardContaining('Familia Romero'));
    await user.keyboard('i');

    const postedChatVerdicts = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/chat-verdicts')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedChatVerdicts).toEqual([
      { method: 'POST', body: { channel: 'telegram', chatId: '7001', messageId: '42', decision: 'ignore' } },
    ]);
  });

  it("posts the `ignore` verdict for its message when a Telegram card's Ignore button is clicked", async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          text: '¿Vienes a cenar el sábado?',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const telegramCard = await findCardContaining('Familia Romero');
    await user.click(within(telegramCard).getByRole('button', { name: /^Ignore/ }));

    const postedChatVerdicts = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/chat-verdicts')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedChatVerdicts).toEqual([
      { method: 'POST', body: { channel: 'telegram', chatId: '7001', messageId: '42', decision: 'ignore' } },
    ]);
  });

  it("posts the `task` verdict for its message when a Telegram card's Task button is clicked", async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          text: '¿Vienes a cenar el sábado?',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const telegramCard = await findCardContaining('Familia Romero');
    await user.click(within(telegramCard).getByRole('button', { name: /^Task/ }));

    const postedChatVerdicts = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/chat-verdicts')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedChatVerdicts).toEqual([
      { method: 'POST', body: { channel: 'telegram', chatId: '7001', messageId: '42', decision: 'task' } },
    ]);
  });

  it("opens the reply composer when a Telegram card's Reply button is clicked", async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          text: '¿Vienes a cenar el sábado?',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const telegramCard = await findCardContaining('Familia Romero');
    await user.click(within(telegramCard).getByRole('button', { name: /^Reply/ }));

    expect(within(telegramCard).getByRole('textbox', { name: 'Reply to Familia Romero' })).toBeInTheDocument();
    expect(within(telegramCard).getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('posts the `task` verdict for its message when the task key `t` is pressed on a Telegram card', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    await user.click(await findCardContaining('Familia Romero'));
    await user.keyboard('t');

    const postedChatVerdicts = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/chat-verdicts')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedChatVerdicts).toEqual([
      { method: 'POST', body: { channel: 'telegram', chatId: '7001', messageId: '42', decision: 'task' } },
    ]);
  });

  it('opens a composer when the reply key `r` is pressed on a Telegram card, saying the same send promise as the Slack composer', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      slackItems: [
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U-Lucía Ramos',
          senderName: 'Lucía Ramos',
          text: 'Can you review the deck before Friday?',
          timestamp: '1762700000.000100',
          permalink: 'https://app.slack.com/client/T0001/D0001/p1762700000000100',
          choices: ['ignore', 'act', 'reply'],
        },
      ],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const slackSection = await screen.findByRole('region', { name: sectionTitles.slack });
    const slackCard = within(slackSection).getByRole('article');
    await user.click(slackCard);
    await user.keyboard('r');
    const slackSendPromise = within(slackCard).getByRole('button', { name: 'Send' }).previousElementSibling
      ?.textContent;
    if (slackSendPromise == null) throw new Error('the Slack composer shows no send promise beside Send');

    const telegramCard = await findCardContaining('Familia Romero');
    await user.click(telegramCard);
    await user.keyboard('r');

    expect(within(telegramCard).getByRole('textbox')).toBeInTheDocument();
    expect(within(telegramCard).getByText(slackSendPromise)).toBeInTheDocument();
  });

  it('removes a Telegram card from the page once the backend accepts its verdict, and keeps the others', async () => {
    answerGetTriageQueueWith(
      {
        action: [],
        groups: [],
        chatItems: [
          chatItem('7001', 'Familia Romero', 'Lucía Romero', '¿Vienes a cenar el sábado?'),
          chatItem('7002', 'Diego Soto', 'Diego Soto', '¿Revisaste el contrato?'),
        ],
        remaining: 0,
        paused: false,
      },
      '/chat-verdicts',
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const familiaCard = await findCardContaining('Familia Romero');
    await user.click(within(familiaCard).getByRole('button', { name: /^Ignore/ }));

    await waitFor(() => {
      expect(screen.queryByText('¿Vienes a cenar el sábado?')).not.toBeInTheDocument();
    });
    expect(screen.getByText('¿Revisaste el contrato?')).toBeInTheDocument();
  });

  it('posts the typed text with channel `telegram` and the chat id to `POST /chat-sends` when Send is pressed in a Telegram card composer', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const card = await findCardContaining('Familia Romero');
    await user.click(card);
    await user.keyboard('r');
    await user.type(within(card).getByRole('textbox'), 'Llego a las ocho');
    await user.click(within(card).getByRole('button', { name: 'Send' }));

    const postedChatSends = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => input === '/chat-sends')
      .map(([, init]) => ({ method: init?.method, body: JSON.parse(init?.body as string) as unknown }));
    expect(postedChatSends).toEqual([
      { method: 'POST', body: { channel: 'telegram', chatId: '7001', text: 'Llego a las ocho' } },
    ]);
  });

  it('removes a Telegram card from the page once the backend accepts a reply sent from its composer, and keeps the others', async () => {
    answerGetTriageQueueWith(
      {
        action: [],
        groups: [],
        chatItems: [
          chatItem('7001', 'Familia Romero', 'Lucía Romero', '¿Vienes a cenar el sábado?'),
          chatItem('7002', 'Diego Soto', 'Diego Soto', '¿Revisaste el contrato?'),
        ],
        remaining: 0,
        paused: false,
      },
      '/chat-sends',
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const familiaCard = await findCardContaining('Familia Romero');
    await user.click(within(familiaCard).getByRole('button', { name: /^Reply/ }));
    await user.type(within(familiaCard).getByRole('textbox'), 'Llego a las ocho');
    await user.click(within(familiaCard).getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.queryByText('¿Vienes a cenar el sábado?')).not.toBeInTheDocument();
    });
    expect(screen.getByText('¿Revisaste el contrato?')).toBeInTheDocument();
  });

  it('keeps `i`, `t` and `r` typed in a Telegram card reply box as text and posts no verdict', async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const card = await findCardContaining('Familia Romero');
    await user.click(card);
    await user.keyboard('r');
    const replyBox = within(card).getByRole('textbox');
    await user.type(replyBox, 'tiro');

    expect(replyBox).toHaveValue('tiro');
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === '/chat-verdicts')).toEqual([]);
  });

  it('keeps the Telegram composer open with the Telegram error shown when Telegram refuses the reply sent from it', async () => {
    const queue = {
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          input === '/triage-queue'
            ? new Response(JSON.stringify(queue), { headers: { 'content-type': 'application/json' } })
            : input === '/chat-sends'
              ? new Response(JSON.stringify({ error: 'CHAT_WRITE_FORBIDDEN' }), {
                  status: 502,
                  headers: { 'content-type': 'application/json' },
                })
              : new Response(null, { status: 404 }),
        ),
      ),
    );
    const user = userEvent.setup();

    render(<TriagePage />);

    const card = await findCardContaining('Familia Romero');
    await user.click(within(card).getByRole('button', { name: /^Reply/ }));
    await user.type(within(card).getByRole('textbox'), 'Llego a las ocho');
    await user.click(within(card).getByRole('button', { name: 'Send' }));

    expect(await within(card).findByText(/CHAT_WRITE_FORBIDDEN/)).toBeInTheDocument();
    expect(within(card).getByRole('textbox')).toHaveValue('Llego a las ocho');
    expect(within(card).getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it("keeps a Telegram card composer's Send disabled while the reply text is empty", async () => {
    answerGetTriageQueueWith({
      action: [],
      groups: [],
      chatItems: [
        {
          channel: 'telegram',
          chatId: '7001',
          messageId: '42',
          chatTitle: 'Familia Romero',
          senderName: 'Lucía Romero',
          text: '¿Vienes a cenar el sábado?',
          time: '2026-11-09T16:00:00.000Z',
        },
      ],
      remaining: 0,
      paused: false,
    });
    const user = userEvent.setup();

    render(<TriagePage />);

    const card = await findCardContaining('Familia Romero');
    await user.click(within(card).getByRole('button', { name: /^Reply/ }));

    expect(within(card).getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
