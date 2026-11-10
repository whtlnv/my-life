import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell, timeInBusinessZone } from './app-shell';
import { answerGetsWith } from './fetch-stub.test-support';

const answerGetNowWith = (body: unknown) => {
  answerGetsWith({ '/now': body });
};

const nowWithNoAccountsAndNothingToTriage = {
  current: [],
  next: [],
  laterToday: [],
  accounts: [],
  badgeCount: 0,
  sources: [],
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
    const chips = await within(status).findAllByRole('listitem');
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
  it.each([
    { name: 'Categories', route: '#/categories' },
    { name: 'Filters', route: '#/filters' },
    { name: 'Statement', route: '#/statement' },
  ])('has a $name tab linking to the $name page, marked current on that route', async ({ name, route }) => {
    answerGetNowWith(nowWithNoAccountsAndNothingToTriage);

    render(<AppShell route={route}>{null}</AppShell>);

    const tab = await screen.findByRole('link', { name });
    expect(tab).toHaveAttribute('href', route);
    expect(tab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });
  it('has a People tab linking to the People page, marked current on that route', async () => {
    answerGetNowWith(nowWithNoAccountsAndNothingToTriage);

    render(<AppShell route="#/people">{null}</AppShell>);

    const tab = await screen.findByRole('link', { name: 'People' });
    expect(tab).toHaveAttribute('href', '#/people');
    expect(tab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });
  it('has a Needs input tab linking to the Needs input page with the count of unanswered questions', async () => {
    const twoUnansweredQuestions = {
      questions: [
        {
          kind: 'category',
          messageId: 'message-1',
          accountEmail: 'work@example.com',
          choices: ['action', 'sales'],
        },
        {
          kind: 'new-sender',
          senderEmail: 'luis@example.com',
          messageId: 'message-2',
          accountEmail: 'work@example.com',
          choices: ['vip', 'ordinary'],
        },
      ],
    };
    answerGetsWith({ '/now': nowWithNoAccountsAndNothingToTriage, '/needs-input': twoUnansweredQuestions });

    render(<AppShell route="#/needs-input">{null}</AppShell>);

    const tab = await screen.findByRole('link', { name: /needs input.*2/i });
    expect(tab).toHaveAttribute('href', '#/needs-input');
    expect(tab).toHaveAttribute('aria-current', 'page');
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
  it('shows a fresh Slack workspace as a source chip with its last poll time and no stale marker', async () => {
    const lastSuccessfulPollAt = '2026-11-09T16:00:00.000Z';
    answerGetNowWith({
      ...nowWithNoAccountsAndNothingToTriage,
      slackWorkspaces: [{ teamId: 'T0001', lastSuccessfulPollAt, stale: false }],
    });

    render(<AppShell route="#/">{null}</AppShell>);

    const status = await screen.findByRole('list', { name: 'Sources' });
    const chip = await within(status).findByText(/T0001/);
    const item = chip.closest('li');
    expect(item).not.toBeNull();
    expect(item).toHaveAttribute('title', expect.stringContaining(timeInBusinessZone(lastSuccessfulPollAt)));
    expect(item).toHaveClass('is-fresh');
    expect(item).not.toHaveTextContent(/stale/i);
  });

  it('shows a stale Slack workspace as a source chip named after the workspace, marked stale', async () => {
    answerGetNowWith({
      ...nowWithNoAccountsAndNothingToTriage,
      slackWorkspaces: [
        { teamId: 'T0001', name: 'Acme Studio', lastSuccessfulPollAt: '2026-11-09T16:00:00.000Z', stale: true },
      ],
    });

    render(<AppShell route="#/">{null}</AppShell>);

    const status = await screen.findByRole('list', { name: 'Sources' });
    const item = (await within(status).findByText('Acme Studio')).closest('li');
    expect(item).toHaveClass('is-stale');
    expect(item).toHaveTextContent(/stale/i);
  });

  it('shows a Telegram source chip saying telegram not logged in when there is no session', async () => {
    answerGetNowWith({ ...nowWithNoAccountsAndNothingToTriage, telegram: { loggedIn: false } });

    render(<AppShell route="#/">{null}</AppShell>);

    const status = await screen.findByRole('list', { name: 'Sources' });
    const item = (await within(status).findByText(/telegram not logged in/i)).closest('li');
    expect(item).not.toBeNull();
    expect(item).toHaveClass('chip-source');
  });
});
