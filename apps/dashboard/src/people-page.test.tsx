import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('says on an urgent row why the contact is urgent, with every reason GET /people gives', async () => {
    answerGetPeopleWith({
      vip: [],
      urgent: [
        {
          displayName: 'Luis Ortega',
          emails: ['luis@erlia.mx'],
          messageIds: ['m2'],
          organization: 'Erlia',
          lastMessageAt: '2026-11-05T16:30:00.000Z',
          reasons: ['unanswered ask', 'deadline'],
        },
      ],
      everyoneElse: [],
    });

    render(<PeoplePage />);

    const urgentList = await screen.findByRole('list', { name: 'Urgent' });
    const row = await within(urgentList).findByRole('listitem');
    expect(row).toHaveTextContent('unanswered ask');
    expect(row).toHaveTextContent('deadline');
  });

  it("shows a selected contact's merged timeline from GET /contacts/:email/timeline, newest first, each message with its account and source link", async () => {
    const people = {
      vip: [
        {
          displayName: 'Ana Ruiz',
          emails: ['ana@mutuus.mx'],
          messageIds: ['m1', 'm2'],
          organization: 'Mutuus',
          lastMessageAt: '2026-11-06T15:00:00.000Z',
        },
      ],
      urgent: [],
      everyoneElse: [],
    };
    const timeline = {
      messages: [
        {
          id: 'm2',
          subject: 'Contract draft',
          accountEmail: 'work@example.com',
          link: 'https://mail.google.com/mail/?authuser=work%40example.com#all/m2',
          sentByUser: false,
          asks: [],
        },
        {
          id: 'm1',
          subject: 'Kickoff notes',
          accountEmail: 'personal@example.com',
          link: 'https://mail.google.com/mail/?authuser=personal%40example.com#all/m1',
          sentByUser: false,
          asks: [],
        },
      ],
    };
    const bodies: Record<string, unknown> = {
      '/people': people,
      [`/contacts/${encodeURIComponent('ana@mutuus.mx')}/timeline`]: timeline,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const body = bodies[String(input)];
        return Promise.resolve(
          body === undefined
            ? new Response(null, { status: 404 })
            : new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
        );
      }),
    );

    render(<PeoplePage />);
    const vipList = await screen.findByRole('list', { name: 'VIP' });
    await userEvent.click(await within(vipList).findByRole('button', { name: /Ana Ruiz/ }));

    const timelineList = await screen.findByRole('list', { name: 'Timeline of Ana Ruiz' });
    const rows = within(timelineList).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    for (const [index, message] of timeline.messages.entries()) {
      const row = rows[index] as HTMLElement;
      expect(within(row).getByRole('link', { name: message.subject })).toHaveAttribute('href', message.link);
      expect(row).toHaveTextContent(message.accountEmail);
    }
  });
});
