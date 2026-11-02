import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('says there is nothing now in the Now block when nothing is current or next', async () => {
    answerGetNowWith({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 });

    render(<DashboardApp />);

    const nowBlock = await screen.findByRole('region', { name: 'Now' });
    expect(await within(nowBlock).findByText(/nothing now/i)).toBeInTheDocument();
  });
});
