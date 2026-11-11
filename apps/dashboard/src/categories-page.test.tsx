import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { accountName } from './account-name';
import { agreementRateText, CategoriesPage, killSwitchLabel, noProposalsYetText } from './categories-page';

const answerGetCategoriesWith = (body: unknown) => {
  const fetchStub = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(input === '/categories' ? Response.json(body) : new Response(null, { status: 404 })),
  );
  vi.stubGlobal('fetch', fetchStub);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CategoriesPage', () => {
  it('shows one row per category from GET /categories with its agreement rate placed before its advise / automatic switch', async () => {
    answerGetCategoriesWith({
      categories: [
        { category: 'sales', mode: 'advise', agreementRate: 0.25, recentProposals: [] },
        { category: 'expense', mode: 'automatic', agreementRate: 0.9, recentProposals: [] },
      ],
    });

    render(<CategoriesPage />);

    const list = await screen.findByRole('list', { name: 'Categories' });
    const rows = await within(list).findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const expectations = [
      { rate: 0.25, automatic: 'false' },
      { rate: 0.9, automatic: 'true' },
    ];
    rows.forEach((row, index) => {
      const { rate, automatic } = expectations[index] ?? { rate: Number.NaN, automatic: '' };
      const rateNode = within(row).getByText(agreementRateText(rate));
      const modeSwitch = within(row).getByRole('switch');
      expect(modeSwitch).toHaveAttribute('aria-checked', automatic);
      expect(rateNode.compareDocumentPosition(modeSwitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('shows "no proposals yet" in place of the rate for a category without proposals', async () => {
    answerGetCategoriesWith({
      categories: [{ category: 'unknown', mode: 'advise', recentProposals: [] }],
    });

    render(<CategoriesPage />);

    const list = await screen.findByRole('list', { name: 'Categories' });
    const row = await within(list).findByRole('listitem');
    expect(noProposalsYetText).toMatch(/^no proposals yet$/i);
    const placeholder = within(row).getByText(noProposalsYetText);
    expect(
      placeholder.compareDocumentPosition(within(row).getByRole('switch')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(row).queryByText(/agreement/)).toBeNull();
  });

  it('sends PUT /categories/:category/mode with the new mode when a switch is flipped and shows the mode the backend then reports', async () => {
    let salesMode = 'advise';
    const modeRequests: { url: string; method: string | undefined; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/categories/sales/mode') {
          const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { mode: string };
          modeRequests.push({ url: input, method: init?.method, body });
          salesMode = body.mode;
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        if (input === '/categories') {
          const categories = [{ category: 'sales', mode: salesMode, agreementRate: 0.5, recentProposals: [] }];
          return Promise.resolve(Response.json({ categories }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<CategoriesPage />);

    const modeSwitch = await screen.findByRole('switch', { name: 'sales' });
    expect(modeSwitch).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(modeSwitch);

    expect(modeRequests).toEqual([{ url: '/categories/sales/mode', method: 'PUT', body: { mode: 'automatic' } }]);
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'sales' })).toHaveAttribute('aria-checked', 'true');
    });
  });
  it('lists the recent proposals of a category with summary, action, account name and a link to the message once it is expanded', async () => {
    const proposal = {
      summary: 'Vendor pitches a CRM',
      action: 'archive',
      accountEmail: 'franciscoc@psmutuus.com',
      link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/pitch-1',
    };
    answerGetCategoriesWith({
      categories: [{ category: 'sales', mode: 'advise', agreementRate: 0.5, recentProposals: [proposal] }],
    });

    render(<CategoriesPage />);

    const list = await screen.findByRole('list', { name: 'Categories' });
    const row = within(list).getByRole('listitem');
    expect(within(row).queryByText(proposal.summary)).toBeNull();
    await userEvent.click(within(row).getByRole('button', { expanded: false }));

    const proposals = within(row).getByRole('list', { name: 'sales proposals' });
    const item = within(proposals).getByRole('listitem');
    expect(within(item).getByText(proposal.summary)).toBeInTheDocument();
    expect(within(item).getByText(proposal.action)).toBeInTheDocument();
    expect(within(item).getByText(accountName(proposal.accountEmail))).toBeInTheDocument();
    expect(within(item).getByRole('link')).toHaveAttribute('href', proposal.link);
  });

  it('sends POST /categories/kill-switch when the kill-switch button is pressed and every switch then reads advise', async () => {
    let mode = 'automatic';
    const killSwitchRequests: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/categories/kill-switch') {
          killSwitchRequests.push({ url: input, method: init?.method });
          mode = 'advise';
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        if (input === '/categories') {
          const categories = [
            { category: 'sales', mode, agreementRate: 0.5, recentProposals: [] },
            { category: 'expense', mode, agreementRate: 0.9, recentProposals: [] },
          ];
          return Promise.resolve(Response.json({ categories }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<CategoriesPage />);

    expect(killSwitchLabel).toMatch(/kill switch/i);
    await screen.findByRole('switch', { name: 'sales' });
    await userEvent.click(screen.getByRole('button', { name: killSwitchLabel }));

    expect(killSwitchRequests).toEqual([{ url: '/categories/kill-switch', method: 'POST' }]);
    await waitFor(() => {
      const switches = screen.getAllByRole('switch');
      expect(switches).toHaveLength(2);
      switches.forEach((modeSwitch) => {
        expect(modeSwitch).toHaveAttribute('aria-checked', 'false');
      });
    });
  });
});
