import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardApp } from './dashboard-app';

describe('DashboardApp', () => {
  it('shows the app title', () => {
    render(<DashboardApp />);

    expect(screen.getByRole('heading', { level: 1, name: 'my-life' })).toBeInTheDocument();
  });
});
