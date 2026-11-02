import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { DashboardApp } from './dashboard-app';

const answerGetNowWith = (body: unknown) => {
  const fetchStub = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      String(input) === '/now'
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
});
