import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { accountName } from './account-name';
import { approveLabel, FiltersPage, rejectLabel } from './filters-page';

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
          return Promise.resolve(
            new Response(JSON.stringify({ proposals }), { headers: { 'content-type': 'application/json' } }),
          );
        }
        if (typeof input === 'string' && input.startsWith('/filter-proposals/')) {
          decisionRequests.push({ url: input, method: init?.method });
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        if (input === '/filters') {
          return Promise.resolve(
            new Response(JSON.stringify({ filters: [] }), { headers: { 'content-type': 'application/json' } }),
          );
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
});
