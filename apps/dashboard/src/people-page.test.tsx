import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PeoplePage } from './people-page';

const answerGetPeopleWith = (body: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        input === '/people'
          ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
          : new Response(null, { status: 404 }),
      ),
    ),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PeoplePage', () => {
  it('shows the VIP, Urgent and Everyone else lists from GET /people, each row with the name, organization and time of the last message', async () => {
    answerGetPeopleWith({
      vip: [
        {
          displayName: 'Ana Ruiz',
          emails: ['ana@mutuus.mx'],
          messageIds: ['m1'],
          organization: 'Mutuus',
          lastMessageAt: '2026-11-06T15:00:00.000Z',
        },
      ],
      urgent: [
        {
          displayName: 'Luis Ortega',
          emails: ['luis@erlia.mx'],
          messageIds: ['m2'],
          organization: 'Erlia',
          lastMessageAt: '2026-11-05T16:30:00.000Z',
          reasons: ['unanswered ask'],
        },
      ],
      everyoneElse: [
        {
          displayName: 'Marta Soto',
          emails: ['marta@acme.com'],
          messageIds: ['m3'],
          organization: 'Acme',
          lastMessageAt: '2026-11-04T17:45:00.000Z',
        },
      ],
    });

    render(<PeoplePage />);

    const expectations = [
      { list: 'VIP', name: 'Ana Ruiz', organization: 'Mutuus', at: '2026-11-06T15:00:00.000Z', time: '09:00' },
      { list: 'Urgent', name: 'Luis Ortega', organization: 'Erlia', at: '2026-11-05T16:30:00.000Z', time: '10:30' },
      { list: 'Everyone else', name: 'Marta Soto', organization: 'Acme', at: '2026-11-04T17:45:00.000Z', time: '11:45' },
    ];
    for (const { list, name, organization, at, time } of expectations) {
      const rows = within(await screen.findByRole('list', { name: list })).getAllByRole('listitem');
      expect(rows).toHaveLength(1);
      const row = rows[0] as HTMLElement;
      expect(row).toHaveTextContent(name);
      expect(row).toHaveTextContent(organization);
      expect(row).toHaveTextContent(time);
      expect(row.querySelector('time')).toHaveAttribute('datetime', at);
    }
  });
});
