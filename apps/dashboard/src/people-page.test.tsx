import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routes } from './app-shell';
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
  window.location.hash = '';
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
      {
        list: 'Everyone else',
        name: 'Marta Soto',
        organization: 'Acme',
        at: '2026-11-04T17:45:00.000Z',
        time: '11:45',
      },
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
  it("shows a selected organization's timeline from GET /organizations/:name/timeline, newest first, each message with its account", async () => {
    const people = {
      vip: [],
      urgent: [],
      everyoneElse: [
        {
          displayName: 'Marta Soto',
          emails: ['marta@acme.com'],
          messageIds: ['m3'],
          organization: 'Acme',
          lastMessageAt: '2026-11-04T17:45:00.000Z',
        },
      ],
    };
    const timeline = {
      messages: [
        { id: 'm4', subject: 'Renewal quote', accountEmail: 'work@example.com' },
        { id: 'm3', subject: 'Onboarding call', accountEmail: 'personal@example.com' },
      ],
    };
    const bodies: Record<string, unknown> = {
      '/people': people,
      [`/organizations/${encodeURIComponent('Acme')}/timeline`]: timeline,
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
    const everyoneElseList = await screen.findByRole('list', { name: 'Everyone else' });
    await userEvent.click(await within(everyoneElseList).findByRole('button', { name: 'Acme' }));

    const timelineList = await screen.findByRole('list', { name: 'Timeline of Acme' });
    const rows = within(timelineList).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    for (const [index, message] of timeline.messages.entries()) {
      const row = rows[index] as HTMLElement;
      expect(row).toHaveTextContent(message.subject);
      expect(row).toHaveTextContent(message.accountEmail);
    }
  });

  it('moves a contact into the VIP list when the user marks it VIP through PUT /contacts/:email/marks/vip, and out again when the user removes the mark through DELETE', async () => {
    const marta = {
      displayName: 'Marta Soto',
      emails: ['marta@acme.com'],
      messageIds: ['m3'],
      organization: 'Acme',
      lastMessageAt: '2026-11-04T17:45:00.000Z',
    };
    const markPath = `/contacts/${encodeURIComponent('marta@acme.com')}/marks/vip`;
    let martaIsVip = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? 'GET';
        if (path === markPath && (method === 'PUT' || method === 'DELETE')) {
          martaIsVip = method === 'PUT';
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        if (path === '/people' && method === 'GET') {
          const lists = martaIsVip
            ? { vip: [marta], urgent: [], everyoneElse: [] }
            : { vip: [], urgent: [], everyoneElse: [marta] };
          return Promise.resolve(
            new Response(JSON.stringify(lists), { headers: { 'content-type': 'application/json' } }),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<PeoplePage />);
    const everyoneElseList = await screen.findByRole('list', { name: 'Everyone else' });
    await userEvent.click(await within(everyoneElseList).findByRole('button', { name: /mark.*vip/i }));

    const vipList = screen.getByRole('list', { name: 'VIP' });
    expect(await within(vipList).findByText('Marta Soto')).toBeInTheDocument();
    expect(within(everyoneElseList).queryByText('Marta Soto')).not.toBeInTheDocument();

    await userEvent.click(within(vipList).getByRole('button', { name: /remove.*vip/i }));

    expect(await within(everyoneElseList).findByText('Marta Soto')).toBeInTheDocument();
    expect(within(vipList).queryByText('Marta Soto')).not.toBeInTheDocument();
  });

  it("shows the timeline of the contact named in the route's query when the page opens at #/people?contact=<email>", async () => {
    const people = {
      vip: [],
      urgent: [
        {
          displayName: 'Sofía Herrera',
          emails: ['sofia@erlia.mx'],
          messageIds: ['m5'],
          organization: 'Erlia',
          lastMessageAt: '2026-11-07T15:00:00.000Z',
        },
      ],
      everyoneElse: [],
    };
    const timeline = {
      messages: [
        {
          id: 'm5',
          subject: 'Can you sign the addendum?',
          accountEmail: 'work@example.com',
          link: 'https://mail.google.com/mail/?authuser=work%40example.com#all/m5',
        },
      ],
    };
    const bodies: Record<string, unknown> = {
      '/people': people,
      [`/contacts/${encodeURIComponent('sofia@erlia.mx')}/timeline`]: timeline,
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
    window.location.hash = `${routes.people}?contact=${encodeURIComponent('sofia@erlia.mx')}`;

    render(<PeoplePage />);

    const timelineList = await screen.findByRole('list', { name: 'Timeline of Sofía Herrera' });
    const row = within(timelineList).getByRole('listitem');
    expect(within(row).getByRole('link', { name: 'Can you sign the addendum?' })).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/?authuser=work%40example.com#all/m5',
    );
  });
});
