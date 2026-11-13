import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routes } from './app-shell';
import { DashboardRouter } from './dashboard-router';
import { answerGetsWith } from './fetch-stub.test-support';

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('DashboardRouter', () => {
  it('shows an Agent tab, and on the agent route shows the agent page rather than the Now page', async () => {
    answerGetsWith({});
    window.location.hash = routes.agent;

    render(<DashboardRouter />);

    const tab = await screen.findByRole('link', { name: 'Agent' });
    expect(tab).toHaveAttribute('href', '#/agent');
    expect(tab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 1, name: 'Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Top tasks' })).not.toBeInTheDocument();
  });

  it("opens a Slack person's timeline on the People tab when the user follows their link in Waiting on you", async () => {
    const leoHandle = { workspaceTeamId: 'T0001', userId: 'U0042' };
    const slackMessage = {
      workspaceTeamId: 'T0001',
      conversationId: 'D0042',
      senderUserId: 'U0042',
      senderName: 'Leo Ramírez',
      text: 'Can you review the rollout plan?',
      timestamp: '1762700000.000100',
      permalink: 'https://app.slack.com/client/T0001/D0042/p1762700000000100',
    };
    answerGetsWith({
      '/now': { current: [], next: [], laterToday: [], accounts: [], sources: [], badgeCount: 0 },
      '/tasks': { tasks: [] },
      '/waiting-on': {
        people: [
          {
            channel: 'slack',
            displayName: 'Leo Ramírez',
            slackHandles: [leoHandle],
            waitingSince: '2026-11-09T16:00:00.000Z',
          },
        ],
      },
      '/people': {
        vip: [],
        urgent: [],
        everyoneElse: [{ channel: 'slack', displayName: 'Leo Ramírez', slackHandles: [leoHandle] }],
      },
      '/slack-contacts/T0001/U0042/timeline': { messages: [slackMessage] },
    });

    render(<DashboardRouter />);
    const waitingBlock = await screen.findByRole('region', { name: 'Waiting on you' });
    await userEvent.click(await within(waitingBlock).findByRole('link', { name: /Leo Ramírez/ }));

    const timelineList = await screen.findByRole('list', { name: 'Timeline of Leo Ramírez' });
    expect(within(timelineList).getByRole('link', { name: slackMessage.text })).toHaveAttribute(
      'href',
      slackMessage.permalink,
    );
  });
});
