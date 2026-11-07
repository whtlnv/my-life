import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { agreementRateText, CategoriesPage, noProposalsYetText } from './categories-page';

const answerGetCategoriesWith = (body: unknown) => {
  const fetchStub = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      input === '/categories'
        ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
        : new Response(null, { status: 404 }),
    ),
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
    const rows = within(list).getAllByRole('listitem');
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
    const row = within(list).getByRole('listitem');
    expect(noProposalsYetText).toMatch(/^no proposals yet$/i);
    const placeholder = within(row).getByText(noProposalsYetText);
    expect(placeholder.compareDocumentPosition(within(row).getByRole('switch')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).queryByText(/agreement/)).toBeNull();
  });
});
