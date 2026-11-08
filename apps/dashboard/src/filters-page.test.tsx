import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { accountName } from './account-name';
import { approveLabel, deleteLabel, FiltersPage, noFiltersText, rejectLabel } from './filters-page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FiltersPage', () => {
  it('lists pending proposals from GET /filter-proposals; Approve sends POST /filter-proposals/:id/approval and Reject sends POST /filter-proposals/:id/rejection', async () => {
    const proposals = [
      {
        id: 'proposal-1',
        criteria: { from: 'news@vendor.example' },
        labelName: 'vendor-news',
        skipInbox: true,
        accountEmail: 'franciscoc@psmutuus.com',
        archiveCount: 3,
      },
      {
        id: 'proposal-2',
        criteria: { listId: 'updates.saas.example' },
        labelName: 'saas-updates',
        skipInbox: true,
        accountEmail: 'francisco@erlia.mx',
        archiveCount: 4,
      },
    ];
    const decisionRequests: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/filter-proposals') {
          return Promise.resolve(Response.json({ proposals }));
        }
        if (typeof input === 'string' && input.startsWith('/filter-proposals/')) {
          decisionRequests.push({ url: input, method: init?.method });
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        if (input === '/filters') {
          return Promise.resolve(Response.json({ filters: [] }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<FiltersPage />);

    const list = await screen.findByRole('list', { name: 'Filter proposals' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const [vendorRow, saasRow] = rows;
    if (vendorRow === undefined || saasRow === undefined) throw new Error('expected two proposal rows');
    expect(within(vendorRow).getByText('news@vendor.example')).toBeInTheDocument();
    expect(within(vendorRow).getByText('vendor-news')).toBeInTheDocument();
    expect(within(vendorRow).getByText(accountName('franciscoc@psmutuus.com'))).toBeInTheDocument();
    expect(within(saasRow).getByText('updates.saas.example')).toBeInTheDocument();

    await userEvent.click(within(vendorRow).getByRole('button', { name: approveLabel }));
    await userEvent.click(within(saasRow).getByRole('button', { name: rejectLabel }));

    expect(decisionRequests).toEqual([
      { url: '/filter-proposals/proposal-1/approval', method: 'POST' },
      { url: '/filter-proposals/proposal-2/rejection', method: 'POST' },
    ]);
  });

  it('lists created filters from GET /filters with account name, criteria and label; Delete sends DELETE /filters/:id with the Gmail filter id', async () => {
    const filters = [
      {
        criteria: { from: 'news@shop.example.com' },
        labelName: 'Shop newsletters',
        skipInbox: true,
        accountEmail: 'franciscoc@psmutuus.com',
        gmailFilterId: 'gmail-filter-1',
        approvedAt: '2026-11-02T15:10:00.000Z',
        acknowledgedAt: '2026-11-02T15:11:00.000Z',
      },
    ];
    const deletionRequests: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/filter-proposals') {
          return Promise.resolve(Response.json({ proposals: [] }));
        }
        if (input === '/filters') {
          return Promise.resolve(Response.json({ filters }));
        }
        if (typeof input === 'string' && input.startsWith('/filters/')) {
          deletionRequests.push({ url: input, method: init?.method });
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<FiltersPage />);

    const list = await screen.findByRole('list', { name: 'Created filters' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    const [shopRow] = rows;
    if (shopRow === undefined) throw new Error('expected one filter row');
    expect(within(shopRow).getByText('news@shop.example.com')).toBeInTheDocument();
    expect(within(shopRow).getByText('Shop newsletters')).toBeInTheDocument();
    expect(within(shopRow).getByText(accountName('franciscoc@psmutuus.com'))).toBeInTheDocument();

    await userEvent.click(within(shopRow).getByRole('button', { name: deleteLabel }));

    expect(deletionRequests).toEqual([{ url: '/filters/gmail-filter-1', method: 'DELETE' }]);
  });

  it('shows an empty state when GET /filter-proposals and GET /filters both return nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (input === '/filter-proposals') {
          return Promise.resolve(Response.json({ proposals: [] }));
        }
        if (input === '/filters') {
          return Promise.resolve(Response.json({ filters: [] }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<FiltersPage />);

    expect(await screen.findByText(noFiltersText)).toBeInTheDocument();
  });
  it('reloads the lists after a decision, so an approved proposal leaves the page', async () => {
    let approved = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/filter-proposals/proposal-1/approval' && init?.method === 'POST') {
          approved = true;
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        if (input === '/filter-proposals') {
          const proposals = approved
            ? []
            : [
                {
                  id: 'proposal-1',
                  criteria: { from: 'news@vendor.example' },
                  labelName: 'vendor-news',
                  accountEmail: 'franciscoc@psmutuus.com',
                },
              ];
          return Promise.resolve(Response.json({ proposals }));
        }
        if (input === '/filters') return Promise.resolve(Response.json({ filters: [] }));
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<FiltersPage />);

    const list = await screen.findByRole('list', { name: 'Filter proposals' });
    await userEvent.click(within(list).getByRole('button', { name: approveLabel }));

    expect(await screen.findByText(noFiltersText)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Filter proposals' })).not.toBeInTheDocument();
  });
});
