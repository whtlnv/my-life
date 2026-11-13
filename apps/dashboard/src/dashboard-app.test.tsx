import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { routes } from './app-shell';
import { DashboardApp, waitingDurationText } from './dashboard-app';
import { answerGetsWith } from './fetch-stub.test-support';

const answerGetNowWith = (body: unknown) => {
  answerGetsWith({ '/now': body });
};

const jsonAnswer = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardApp', () => {
  it('shows the app title', () => {
    render(<DashboardApp />);

    expect(screen.getByRole('heading', { level: 1, name: 'Now' })).toBeInTheDocument();
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
    expect(await within(nowBlock).findByText('Daily standup')).toBeInTheDocument();
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
      vi.fn(() => new Promise<Response>(() => undefined)),
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
        return jsonAnswer(body);
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

  it('shows an all-day later-today event as all day instead of a clock time', async () => {
    answerGetNowWith({
      current: [],
      next: [],
      laterToday: [
        {
          id: 'event-6',
          iCalUID: 'home@google.com',
          title: 'Home',
          allDay: true,
          start: '2026-11-03',
          end: '2026-11-04',
          attendees: [],
          accounts: ['personal@example.com'],
        },
      ],
      accounts: [],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const laterTodayBlock = await screen.findByRole('region', { name: 'Later today' });
    const item = await within(laterTodayBlock).findByRole('listitem');
    expect(item).toHaveTextContent('Home');
    expect(item).toHaveTextContent(/all day/i);
    expect(item).not.toHaveTextContent(/\d{2}:\d{2}/);
  });

  it('still shows the start time of a timed later-today event listed beside an all-day one', async () => {
    answerGetNowWith({
      current: [],
      next: [],
      laterToday: [
        {
          id: 'event-6',
          iCalUID: 'home@google.com',
          title: 'Home',
          allDay: true,
          start: '2026-11-03',
          end: '2026-11-04',
          attendees: [],
          accounts: ['personal@example.com'],
        },
        {
          id: 'event-7',
          iCalUID: 'standup@google.com',
          title: 'Standup',
          allDay: false,
          start: '2026-11-03T17:00:00.000Z',
          end: '2026-11-03T17:15:00.000Z',
          attendees: [],
          accounts: ['work@example.com'],
        },
      ],
      accounts: [],
      badgeCount: 0,
    });

    render(<DashboardApp />);

    const laterTodayBlock = await screen.findByRole('region', { name: 'Later today' });
    const timedItem = (await within(laterTodayBlock).findByText(/Standup/)).closest('li');
    expect(timedItem).toHaveTextContent('11:00');
    expect(timedItem).not.toHaveTextContent(/all day/i);
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

  it('shows the 3 highest-ranked open tasks with their reasons, and not the fourth', async () => {
    const rankedTasks = [
      {
        id: 'task-1',
        title: 'Send the slides',
        account: 'work@example.com',
        rank: 1,
        reason: 'The board meets at four',
      },
      { id: 'task-2', title: 'Approve the budget', account: 'work@example.com', rank: 2, reason: 'Due today' },
      { id: 'task-3', title: 'Call the bank', account: 'personal@example.com', rank: 3, reason: 'Ana is waiting' },
      { id: 'task-4', title: 'Renew the domain', account: 'personal@example.com', rank: 4, reason: 'Due next week' },
    ];
    answerGetsWith({
      '/now': { current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 },
      '/tasks': { tasks: rankedTasks },
    });

    render(<DashboardApp />);

    for (const { title, reason } of rankedTasks.slice(0, 3)) {
      expect(await screen.findByText(title)).toBeInTheDocument();
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
    expect(screen.queryByText('Renew the domain')).not.toBeInTheDocument();
    expect(screen.queryByText('Due next week')).not.toBeInTheDocument();
  });

  it('marks a task on the now page done with one click, and it leaves the page', async () => {
    let openTasks = [
      {
        id: 'task-1',
        title: 'Send the slides',
        account: 'work@example.com',
        rank: 1,
        reason: 'The board meets at four',
      },
      { id: 'task-2', title: 'Approve the budget', account: 'work@example.com', rank: 2, reason: 'Due today' },
    ];
    const fetchStub = vi.fn((input: string, init?: RequestInit) => {
      const url = input;
      if (url === '/tasks/task-1/done' && init?.method === 'POST') {
        openTasks = openTasks.filter((task) => task.id !== 'task-1');
        return jsonAnswer({});
      }
      if (url === '/tasks') return jsonAnswer({ tasks: openTasks });
      if (url === '/now') return jsonAnswer({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 });
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchStub);

    render(<DashboardApp />);

    const taskRow = (await screen.findByText('Send the slides')).closest('li');
    if (taskRow === null) throw new Error('the task is not shown as a list item');
    await userEvent.click(within(taskRow).getByRole('button'));

    expect(fetchStub).toHaveBeenCalledWith('/tasks/task-1/done', expect.objectContaining({ method: 'POST' }));
    await vi.waitFor(() => {
      expect(screen.queryByText('Send the slides')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Approve the budget')).toBeInTheDocument();
  });

  it('marks a Slack task, whose id holds slashes, done at the one task path the backend routes', async () => {
    const slackTaskId = 'slack-T0001/D0001/1700000000.000100';
    const fetchStub = vi.fn((input: string) => {
      if (input === '/tasks') {
        return jsonAnswer({
          tasks: [{ id: slackTaskId, title: 'Answer Ana in Slack', account: 'T0001', rank: 1, reason: 'Ana asked' }],
        });
      }
      if (input === '/now') return jsonAnswer({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 });
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchStub);

    render(<DashboardApp />);

    const taskRow = (await screen.findByText('Answer Ana in Slack')).closest('li');
    if (taskRow === null) throw new Error('the task is not shown as a list item');
    await userEvent.click(within(taskRow).getByRole('button'));

    expect(fetchStub).toHaveBeenCalledWith(
      `/tasks/${encodeURIComponent(slackTaskId)}/done`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps a task on the page when the backend refuses to mark it done', async () => {
    const fetchStub = vi.fn((input: string, init?: RequestInit) => {
      if (input === '/tasks') {
        return jsonAnswer({
          tasks: [{ id: 'task-1', title: 'Approve the budget', account: 'a@x.com', rank: 1, reason: 'due' }],
        });
      }
      if (input === '/now') return jsonAnswer({ current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 });
      if (input === '/tasks/task-1/done' && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'refused' }), { status: 409 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchStub);

    render(<DashboardApp />);

    const taskRow = (await screen.findByText('Approve the budget')).closest('li');
    if (taskRow === null) throw new Error('the task is not shown as a list item');
    await userEvent.click(within(taskRow).getByRole('button'));

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith('/tasks/task-1/done', expect.anything());
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('Approve the budget')).toBeInTheDocument();
  });
  it('lists the people waiting on a reply, longest wait first, each linking to their timeline on the People page', async () => {
    answerGetsWith({
      '/now': { current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 },
      '/tasks': { tasks: [] },
      '/waiting-on': {
        people: [
          { email: 'luis@example.com', displayName: 'Luis Pérez', waitingSince: '2026-11-06T16:00:00.000Z' },
          { email: 'ana@example.com', displayName: 'Ana Ruiz', waitingSince: '2026-11-03T09:00:00.000Z' },
          { email: 'marta@example.com', displayName: 'Marta Gil', waitingSince: '2026-11-07T10:00:00.000Z' },
        ],
      },
    });

    render(<DashboardApp />);

    const waitingBlock = await screen.findByRole('region', { name: 'Waiting on you' });
    await within(waitingBlock).findByRole('link', { name: /Ana Ruiz/ });
    const links = within(waitingBlock).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('Ana Ruiz'),
      expect.stringContaining('Luis Pérez'),
      expect.stringContaining('Marta Gil'),
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      ['ana@example.com', 'luis@example.com', 'marta@example.com'].map(
        (email) => `${routes.people}?contact=${encodeURIComponent(email)}`,
      ),
    );
  });
  it("shows, next to each waiting person's name, how long they have been waiting", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.setSystemTime(new Date('2026-11-08T09:00:00.000Z'));
    const anaWaitingSince = '2026-11-03T09:00:00.000Z';
    answerGetsWith({
      '/now': { current: [], next: [], laterToday: [], accounts: [], badgeCount: 0 },
      '/tasks': { tasks: [] },
      '/waiting-on': {
        people: [{ email: 'ana@example.com', displayName: 'Ana Ruiz', waitingSince: anaWaitingSince }],
      },
    });

    render(<DashboardApp />);

    const waitingBlock = await screen.findByRole('region', { name: 'Waiting on you' });
    const anaRow = (await within(waitingBlock).findByRole('link', { name: /Ana Ruiz/ })).closest('li');
    if (anaRow === null) throw new Error('the waiting person is not shown as a list item');
    const expectedDuration = waitingDurationText(anaWaitingSince, new Date());
    expect(expectedDuration).toMatch(/\b5\b/);
    expect(anaRow).toHaveTextContent(expectedDuration);
  });
});

describe('waitingDurationText', () => {
  it.each([
    { waited: '20 minutes', waitingSince: '2026-11-09T14:40:00.000Z', expected: '< 1 h' },
    { waited: '3 hours', waitingSince: '2026-11-09T12:00:00.000Z', expected: '3 h' },
    { waited: '1 day', waitingSince: '2026-11-08T15:00:00.000Z', expected: '1 day' },
    { waited: '5 days', waitingSince: '2026-11-04T15:00:00.000Z', expected: '5 days' },
  ])('says $expected for someone who has waited $waited', ({ waitingSince, expected }) => {
    expect(waitingDurationText(waitingSince, new Date('2026-11-09T15:00:00.000Z'))).toBe(expected);
  });
});
