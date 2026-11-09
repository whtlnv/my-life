import { render, screen } from '@testing-library/react';
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
});
