import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { DashboardApp } from './dashboard-app';

const answerGetNowWith = (body: unknown) => {
  const fetchStub = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      input === '/now'
        ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
        : new Response(null, { status: 404 }),
    ),
  );
  vi.stubGlobal('fetch', fetchStub);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardApp', () => {
  it('shows the app title', () => {
    render(<DashboardApp />);

    expect(screen.getByRole('heading', { level: 1, name: 'my-life' })).toBeInTheDocument();
  });

  it("shows the current event's title, join link and attendees in the Now block", async () => {
    answerGetNowWith({
      current: [
        {
          id: 'event-1',
          iCalUID: 'standup@google.com',
          title: 'Daily standup',
          start: '2026-11-02T15:00:00.000Z',
          end: '2026-11-02T15:30:00.000Z',
          meetLink: 'https://meet.google.com/abc-defg-hij',
          attendees: [
            { email: 'ana@example.com', displayName: 'Ana Ruiz' },
            { email: 'luis@example.com', displayName: 'Luis Pérez' },
          ],
          accounts: ['work@example.com'],
        },
      ],
      next: [],
      laterToday: [],
      accounts: [],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const nowBlock = await screen.findByRole('region', { name: 'Now' });
    expect(within(nowBlock).getByText('Daily standup')).toBeInTheDocument();
    expect(within(nowBlock).getByRole('link', { name: /join/i })).toHaveAttribute(
      'href',
      'https://meet.google.com/abc-defg-hij',
    );
    expect(within(nowBlock).getByText(/Ana Ruiz/)).toBeInTheDocument();
    expect(within(nowBlock).getByText(/Luis Pérez/)).toBeInTheDocument();
  });

  it('shows no join link for a current event without a Meet link', async () => {
    answerGetNowWith({
      current: [
        {
          id: 'event-5',
          iCalUID: 'lunch@google.com',
          title: 'Lunch with Ana',
          start: '2026-11-02T19:00:00.000Z',
          end: '2026-11-02T20:00:00.000Z',
          attendees: [],
          accounts: ['personal@example.com'],
        },
      ],
      next: [],
      laterToday: [],
      accounts: [],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const nowBlock = await screen.findByRole('region', { name: 'Now' });
    expect(await within(nowBlock).findByText('Lunch with Ana')).toBeInTheDocument();
    expect(within(nowBlock).queryByText(/join/i)).not.toBeInTheDocument();
  });

  it('shows a next event in the Now block with the minutes until it starts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.setSystemTime(new Date('2026-11-02T14:50:00.000Z'));
    answerGetNowWith({
      current: [],
      next: [
        {
          id: 'event-2',
          iCalUID: 'planning@google.com',
          title: 'Sprint planning',
          start: '2026-11-02T15:00:00.000Z',
          end: '2026-11-02T16:00:00.000Z',
          meetLink: 'https://meet.google.com/xyz-abcd-efg',
          attendees: [],
          accounts: ['work@example.com'],
        },
      ],
      laterToday: [],
      accounts: [],
      badgeCount: 1,
    });

    render(<DashboardApp />);

    const nowBlock = await screen.findByRole('region', { name: 'Now' });
    expect(await within(nowBlock).findByText('Sprint planning')).toBeInTheDocument();
    expect(within(nowBlock).getByText(/\b10 min/)).toBeInTheDocument();
  });

  it('says there is nothing now in the Now block when nothing is current or next', async () => {
    answerGetNowWith({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 });

    render(<DashboardApp />);

    const nowBlock = await screen.findByRole('region', { name: 'Now' });
    expect(await within(nowBlock).findByText(/nothing now/i)).toBeInTheDocument();
  });

  it('does not say there is nothing now when a next event shows and nothing is current', async () => {
    answerGetNowWith({
      current: [],
      next: [
        {
          id: 'event-2',
          iCalUID: 'planning@google.com',
          title: 'Sprint planning',
          start: '2026-11-02T15:00:00.000Z',
          end: '2026-11-02T16:00:00.000Z',
          meetLink: 'https://meet.google.com/xyz-abcd-efg',
          attendees: [],
          accounts: ['work@example.com'],
        },
      ],
      laterToday: [],
      accounts: [],
      badgeCount: 1,
    });

    render(<DashboardApp />);

    const nowBlock = await screen.findByRole('region', { name: 'Now' });
    expect(await within(nowBlock).findByText('Sprint planning')).toBeInTheDocument();
    expect(within(nowBlock).queryByText(/nothing now/i)).not.toBeInTheDocument();
  });

  it('says the backend cannot be reached instead of nothing now when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    render(<DashboardApp />);

    const nowBlock = await screen.findByRole('region', { name: 'Now' });
    expect(await within(nowBlock).findByText(/backend/i)).toBeInTheDocument();
    expect(within(nowBlock).queryByText(/nothing now/i)).not.toBeInTheDocument();
  });

  it('shows a loading state instead of nothing now in the Now block before the backend answers', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    render(<DashboardApp />);

    const nowBlock = screen.getByRole('region', { name: 'Now' });
    expect(within(nowBlock).getByText(/loading/i)).toBeInTheDocument();
    expect(within(nowBlock).queryByText(/nothing now/i)).not.toBeInTheDocument();
  });

  it('updates the Now block within a minute when the backend answers differently, without a reload', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const nowAnswer = (title: string) => ({
      current: [
        {
          id: title,
          iCalUID: `${title}@google.com`,
          title,
          start: '2026-11-02T15:00:00.000Z',
          end: '2026-11-02T15:30:00.000Z',
          attendees: [],
          accounts: ['work@example.com'],
        },
      ],
      next: [],
      laterToday: [],
      accounts: [],
      badgeCount: 0,
    });
    const answers = [nowAnswer('Daily standup'), nowAnswer('Design review')];
    let answersGiven = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const body = answers[Math.min(answersGiven, answers.length - 1)];
        answersGiven += 1;
        return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
      }),
    );

    render(<DashboardApp />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    const nowBlock = screen.getByRole('region', { name: 'Now' });
    expect(within(nowBlock).getByText('Daily standup')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(within(nowBlock).getByText('Design review')).toBeInTheDocument();
    expect(within(nowBlock).queryByText('Daily standup')).not.toBeInTheDocument();
  });

  it('lists the later-today events in time order with their start times in America/Mexico_City', async () => {
    answerGetNowWith({
      current: [],
      next: [],
      laterToday: [
        {
          id: 'event-3',
          iCalUID: 'review@google.com',
          title: 'Design review',
          start: '2026-11-02T17:00:00.000Z',
          end: '2026-11-02T18:00:00.000Z',
          attendees: [],
          accounts: ['work@example.com'],
        },
        {
          id: 'event-4',
          iCalUID: 'one-on-one@google.com',
          title: 'One-on-one',
          start: '2026-11-02T20:30:00.000Z',
          end: '2026-11-02T21:00:00.000Z',
          attendees: [],
          accounts: ['personal@example.com'],
        },
      ],
      accounts: [],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const laterTodayBlock = await screen.findByRole('region', { name: 'Later today' });
    const items = await within(laterTodayBlock).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Design review');
    expect(items[0]).toHaveTextContent('11:00');
    expect(items[1]).toHaveTextContent('One-on-one');
    expect(items[1]).toHaveTextContent('14:30');
  });

  it('shows each account with the time it last reported in America/Mexico_City', async () => {
    answerGetNowWith({
      current: [],
      next: [],
      laterToday: [],
      accounts: [
        { email: 'work@example.com', lastReportedAt: '2026-11-02T15:05:00.000Z', stale: false },
        {
          email: 'personal@example.com',
          lastReportedAt: '2026-11-02T14:40:00.000Z',
          stale: false,
        },
      ],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const accountsBlock = await screen.findByRole('region', { name: 'Accounts' });
    const items = await within(accountsBlock).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('work@example.com');
    expect(items[0]).toHaveTextContent('09:05');
    expect(items[1]).toHaveTextContent('personal@example.com');
    expect(items[1]).toHaveTextContent('08:40');
  });

  it('marks a stale account as stale', async () => {
    answerGetNowWith({
      current: [],
      next: [],
      laterToday: [],
      accounts: [{ email: 'personal@example.com', lastReportedAt: '2026-11-02T14:40:00.000Z', stale: true }],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const accountsBlock = await screen.findByRole('region', { name: 'Accounts' });
    const item = await within(accountsBlock).findByRole('listitem');
    expect(item).toHaveTextContent('personal@example.com');
    expect(item).toHaveTextContent(/stale/i);
  });

  it('shows no stale marker on a fresh account', async () => {
    answerGetNowWith({
      current: [],
      next: [],
      laterToday: [],
      accounts: [{ email: 'personal@example.com', lastReportedAt: '2026-11-02T14:40:00.000Z', stale: false }],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const accountsBlock = await screen.findByRole('region', { name: 'Accounts' });
    const item = await within(accountsBlock).findByRole('listitem');
    expect(item).toHaveTextContent('personal@example.com');
    expect(item).not.toHaveTextContent(/stale/i);
  });
});
