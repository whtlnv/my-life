import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';

const answerGetNowWith = (body: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        input === '/now'
          ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
          : new Response(null, { status: 404 }),
      ),
    ),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('shows one status chip per account with its calendar and mail reports, marking the stale one', async () => {
    answerGetNowWith({
      current: [],
      next: [],
      laterToday: [],
      accounts: [
        { email: 'work@example.com', lastReportedAt: '2026-11-07T15:00:00.000Z', stale: false },
        { email: 'personal@example.com', lastReportedAt: '2026-11-07T14:00:00.000Z', stale: false },
        { email: 'new@example.com', lastReportedAt: '2026-11-07T15:00:00.000Z', stale: false },
      ],
      badgeCount: 0,
      sources: [
        { email: 'work@example.com', source: 'mail', lastReportedAt: '2026-11-07T15:01:00.000Z', stale: false },
        { email: 'personal@example.com', source: 'mail', lastReportedAt: '2026-11-07T13:00:00.000Z', stale: true },
      ],
    });

    render(<AppShell route="#/">{null}</AppShell>);

    const status = await screen.findByRole('list', { name: 'Sources' });
    const chips = within(status).getAllByRole('listitem');
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent(/work@example.com/);
    expect(chips[0]).toHaveAttribute('title', 'work@example.com · calendar 09:00 · mail 09:01');
    expect(chips[0]).not.toHaveTextContent(/stale/i);
    expect(chips[1]).toHaveTextContent(/personal@example.com/);
    expect(chips[1]).toHaveTextContent(/mail stale/);
    expect(chips[1]).toHaveAttribute('title', 'personal@example.com · calendar 08:00 · mail 07:00');
    expect(chips[2]).toHaveAttribute('title', 'new@example.com · calendar 09:00 · mail never');
  });

  it('marks the current page in the tabs and shows how many items need the user on the triage tab', async () => {
    answerGetNowWith({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 3, sources: [] });

    render(<AppShell route="#/triage">{null}</AppShell>);

    const triageTab = await screen.findByRole('link', { name: /triage.*3/i });
    expect(triageTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });
  it('has a Categories tab linking to the categories page, marked current on that route', async () => {
    answerGetNowWith({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0, sources: [] });

    render(<AppShell route="#/categories">{null}</AppShell>);

    const categoriesTab = await screen.findByRole('link', { name: 'Categories' });
    expect(categoriesTab).toHaveAttribute('href', '#/categories');
    expect(categoriesTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });
  it('has a Filters tab linking to the filters page, marked current on that route', async () => {
    answerGetNowWith({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0, sources: [] });

    render(<AppShell route="#/filters">{null}</AppShell>);

    const filtersTab = await screen.findByRole('link', { name: 'Filters' });
    expect(filtersTab).toHaveAttribute('href', '#/filters');
    expect(filtersTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });
  it('has a Statement tab linking to the statement page, marked current on that route', async () => {
    answerGetNowWith({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0, sources: [] });

    render(<AppShell route="#/statement">{null}</AppShell>);

    const statementTab = await screen.findByRole('link', { name: 'Statement' });
    expect(statementTab).toHaveAttribute('href', '#/statement');
    expect(statementTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });
  it('still renders the tabs and the page when the backend cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connection refused'))),
    );

    render(
      <AppShell route="#/">
        <p>page body</p>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Now' })).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/now');
    });
    expect(within(screen.getByRole('list', { name: 'Sources' })).queryAllByRole('listitem')).toHaveLength(0);
  });
});
