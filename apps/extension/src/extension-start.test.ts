import { describe, expect, it, vi } from 'vitest';

import { startExtension } from './extension-start';

const calendarApi = 'https://www.googleapis.com/calendar/v3';
const gmailApi = 'https://gmail.googleapis.com/gmail/v1';
const peopleApi = 'https://people.googleapis.com/v1';

describe('startExtension', () => {
  it('registers with the backend using the profile account email, then posts the first snapshot', async () => {
    const backendPosts: { path: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ path: url.pathname, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(backendPosts).toEqual([
      { path: '/register', body: { email: 'francisco@example.com' } },
      { path: '/calendar-snapshot', body: { accountEmail: 'francisco@example.com', events: [] } },
    ]);
  });

  it('polls again every 5 minutes after the first snapshot and posts each result, and a failed poll does not stop the next one', async () => {
    const backendPosts: { path: string; body: unknown }[] = [];
    let calendarListRequests = 0;
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        calendarListRequests++;
        if (calendarListRequests === 2) {
          return Promise.resolve(new Response('forbidden', { status: 403 }));
        }
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ path: url.pathname, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    let scheduledMilliseconds: number | undefined;
    let scheduledPoll: (() => Promise<void>) | undefined;

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
      every: (milliseconds: number, poll: () => Promise<void>) => {
        scheduledMilliseconds = milliseconds;
        scheduledPoll = poll;
      },
    });

    expect(scheduledMilliseconds).toBe(5 * 60 * 1000);
    await expect(scheduledPoll?.()).resolves.toBeUndefined();
    await expect(scheduledPoll?.()).resolves.toBeUndefined();
    const snapshot = { path: '/calendar-snapshot', body: { accountEmail: 'francisco@example.com', events: [] } };
    expect(backendPosts).toEqual([{ path: '/register', body: { email: 'francisco@example.com' } }, snapshot, snapshot]);
  });

  it('requests the Calendar window for the moment of each scheduled poll, so a poll the next day asks for the next day', async () => {
    const requestedWindows: { timeMin: string | null; timeMax: string | null }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(
          Response.json({ kind: 'calendar#calendarList', items: [{ id: 'primary', summary: 'Francisco' }] }),
        );
      }
      if (url.pathname === '/calendar/v3/calendars/primary/events') {
        requestedWindows.push({ timeMin: url.searchParams.get('timeMin'), timeMax: url.searchParams.get('timeMax') });
        return Promise.resolve(Response.json({ kind: 'calendar#events', items: [] }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    let currentTime = new Date('2026-11-02T10:00:00-06:00');
    let scheduledPoll: (() => Promise<void>) | undefined;

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => currentTime,
      timeZone: 'America/Mexico_City',
      every: (_milliseconds: number, poll: () => Promise<void>) => {
        scheduledPoll = poll;
      },
    });
    currentTime = new Date('2026-11-03T09:00:00-06:00');
    await scheduledPoll?.();

    expect(requestedWindows).toEqual([
      { timeMin: '2026-11-02T06:00:00.000Z', timeMax: '2026-11-04T06:00:00.000Z' },
      { timeMin: '2026-11-03T06:00:00.000Z', timeMax: '2026-11-05T06:00:00.000Z' },
    ]);
  });

  it('refreshes the badge from GET /now after the first snapshot and after every scheduled poll', async () => {
    const badgeCounts = [1, 3];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/now' && init?.method !== 'POST') {
        return Promise.resolve(Response.json({ badgeCount: badgeCounts.shift() }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const badgeTexts: string[] = [];
    let scheduledPoll: (() => Promise<void>) | undefined;

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
      every: (_milliseconds: number, poll: () => Promise<void>) => {
        scheduledPoll = poll;
      },
      setBadgeText: (text: string) => {
        badgeTexts.push(text);
        return Promise.resolve();
      },
    });
    const badgeTextsAfterStart = [...badgeTexts];
    await scheduledPoll?.();

    expect(badgeTextsAfterStart).toEqual(['1']);
    expect(badgeTexts).toEqual(['1', '3']);
  });

  it('posts the Gmail report to the backend with the profile account email', async () => {
    const mailReports: unknown[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/mail-report' && init?.method === 'POST') {
        mailReports.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(mailReports).toEqual([{ accountEmail: 'francisco@example.com', historyId: '4321', messages: [] }]);
  });

  it('still starts and posts the calendar snapshot when Gmail is unreachable, reporting the Gmail failure to the console', async () => {
    const backendPosts: { path: string; body: unknown }[] = [];
    const gmailUnreachable = new TypeError('Failed to fetch');
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin === 'https://gmail.googleapis.com') {
        return Promise.reject(gmailUnreachable);
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ path: url.pathname, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        startExtension({
          fetch: fakeFetch,
          profileAccountEmail: () => Promise.resolve('francisco@example.com'),
          accessToken: () => Promise.resolve('token-for-francisco'),
          backendUrl: 'http://127.0.0.1:7777',
          clock: () => new Date('2026-11-02T10:00:00-06:00'),
          timeZone: 'America/Mexico_City',
        }),
      ).resolves.toBeUndefined();

      expect(backendPosts).toContainEqual({
        path: '/calendar-snapshot',
        body: { accountEmail: 'francisco@example.com', events: [] },
      });
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), gmailUnreachable);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('polls Gmail again every 60 seconds and posts each mail report', async () => {
    const mailReports: unknown[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href.startsWith(`${gmailApi}/users/me/history`)) {
        return Promise.resolve(Response.json({ historyId: '4321' }));
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/mail-report' && init?.method === 'POST') {
        mailReports.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const scheduledPolls = new Map<number, () => Promise<void>>();

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
      every: (milliseconds: number, poll: () => Promise<void>) => {
        scheduledPolls.set(milliseconds, poll);
      },
    });
    const gmailPoll = scheduledPolls.get(60 * 1000);
    await gmailPoll?.();

    expect(gmailPoll).toBeDefined();
    expect(mailReports).toHaveLength(2);
  });

  it('starts the second scheduled Gmail poll from the history id the first poll reported, not from an empty inbox read', async () => {
    const gmailReads: string[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin === 'https://gmail.googleapis.com') {
        gmailReads.push(url.pathname + url.search);
      }
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href.startsWith(`${gmailApi}/users/me/history`)) {
        return Promise.resolve(Response.json({ historyId: '4321' }));
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const scheduledPolls = new Map<number, () => Promise<void>>();

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
      every: (milliseconds: number, poll: () => Promise<void>) => {
        scheduledPolls.set(milliseconds, poll);
      },
    });
    gmailReads.length = 0;
    await scheduledPolls.get(60 * 1000)?.();

    expect(gmailReads).toContain('/gmail/v1/users/me/history?startHistoryId=4321');
    expect(gmailReads).not.toContain('/gmail/v1/users/me/messages?labelIds=INBOX');
  });

  it('reports a failed scheduled Gmail poll to the console, and the next scheduled poll still posts a mail report', async () => {
    const mailReports: unknown[] = [];
    const gmailUnreachable = new TypeError('Failed to fetch');
    let historyReads = 0;
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href.startsWith(`${gmailApi}/users/me/history`)) {
        historyReads++;
        if (historyReads === 1) {
          return Promise.reject(gmailUnreachable);
        }
        return Promise.resolve(Response.json({ historyId: '4321' }));
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/mail-report' && init?.method === 'POST') {
        mailReports.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const scheduledPolls = new Map<number, () => Promise<void>>();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await startExtension({
        fetch: fakeFetch,
        profileAccountEmail: () => Promise.resolve('francisco@example.com'),
        accessToken: () => Promise.resolve('token-for-francisco'),
        backendUrl: 'http://127.0.0.1:7777',
        clock: () => new Date('2026-11-02T10:00:00-06:00'),
        timeZone: 'America/Mexico_City',
        every: (milliseconds: number, poll: () => Promise<void>) => {
          scheduledPolls.set(milliseconds, poll);
        },
      });
      const gmailPoll = scheduledPolls.get(60 * 1000);
      await expect(gmailPoll?.()).resolves.toBeUndefined();
      await expect(gmailPoll?.()).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalledWith(expect.any(String), gmailUnreachable);
      expect(mailReports).toHaveLength(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('after the first Gmail poll, archives the pending archive commands for the profile account in Gmail and acknowledges them', async () => {
    const gmailModifications: string[] = [];
    const acknowledgements: string[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href === `${gmailApi}/users/me/labels` && init?.method !== 'POST') {
        return Promise.resolve(Response.json({ labels: [{ id: 'Label_9', name: 'my-life/archived' }] }));
      }
      if (url.pathname.endsWith('/modify') && init?.method === 'POST') {
        gmailModifications.push(url.pathname);
        return Promise.resolve(Response.json({ id: 'message-7' }));
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/commands?accountEmail=francisco%40example.com') {
        return Promise.resolve(Response.json({ commands: [{ id: 'command-1', messageId: 'message-7' }] }));
      }
      if (url.pathname.endsWith('/acknowledgement') && init?.method === 'POST') {
        acknowledgements.push(url.pathname);
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(gmailModifications).toEqual(['/gmail/v1/users/me/messages/message-7/modify']);
    expect(acknowledgements).toEqual(['/commands/command-1/acknowledgement']);
  });

  it('after the first Gmail poll, creates and deletes the Gmail filters the pending create-filter and delete-filter commands ask for, and acknowledges both', async () => {
    const gmailFilterRequests: { method: string | undefined; path: string; body: unknown }[] = [];
    const acknowledgements: { path: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href === `${gmailApi}/users/me/labels` && init?.method !== 'POST') {
        return Promise.resolve(Response.json({ labels: [{ id: 'Label_99', name: 'my-life/shop' }] }));
      }
      if (url.pathname.startsWith('/gmail/v1/users/me/settings/filters')) {
        gmailFilterRequests.push({ method: init?.method, path: url.pathname, body });
        if (init?.method === 'POST') {
          return Promise.resolve(Response.json({ id: 'gmail-filter-7', ...(body as object) }));
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/commands?accountEmail=francisco%40example.com') {
        return Promise.resolve(
          Response.json({
            commands: [
              {
                id: 'create-filter-proposal-1',
                type: 'create-filter',
                criteria: { from: 'news@shop.example.com' },
                labelName: 'my-life/shop',
                skipInbox: true,
              },
              { id: 'delete-filter-proposal-2', type: 'delete-filter', gmailFilterId: 'gmail-filter-3' },
            ],
          }),
        );
      }
      if (url.pathname.endsWith('/acknowledgement') && init?.method === 'POST') {
        acknowledgements.push({ path: url.pathname, body });
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(gmailFilterRequests).toEqual([
      {
        method: 'POST',
        path: '/gmail/v1/users/me/settings/filters',
        body: {
          criteria: { from: 'news@shop.example.com' },
          action: { addLabelIds: ['Label_99'], removeLabelIds: ['INBOX'] },
        },
      },
      { method: 'DELETE', path: '/gmail/v1/users/me/settings/filters/gmail-filter-3', body: undefined },
    ]);
    expect(acknowledgements).toEqual([
      { path: '/commands/create-filter-proposal-1/acknowledgement', body: { gmailFilterId: 'gmail-filter-7' } },
      { path: '/commands/delete-filter-proposal-2/acknowledgement', body: undefined },
    ]);
  });

  it('imports the Google Contacts at start and again once a day, and a scheduled Gmail poll imports none', async () => {
    const contactsImports: unknown[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href.startsWith(`${gmailApi}/users/me/history`)) {
        return Promise.resolve(Response.json({ historyId: '4321' }));
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href.startsWith('http://127.0.0.1:7777/commands?')) {
        return Promise.resolve(Response.json({ commands: [] }));
      }
      if (url.href === `${peopleApi}/contactGroups`) {
        return Promise.resolve(Response.json({ contactGroups: [] }));
      }
      if (url.href.startsWith(`${peopleApi}/people/me/connections`)) {
        return Promise.resolve(Response.json({ connections: [] }));
      }
      if (url.href.startsWith(`${peopleApi}/otherContacts`)) {
        return Promise.resolve(Response.json({ otherContacts: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/contacts-import' && init?.method === 'POST') {
        contactsImports.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const scheduledPolls = new Map<number, () => Promise<void>>();

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
      every: (milliseconds: number, poll: () => Promise<void>) => {
        scheduledPolls.set(milliseconds, poll);
      },
    });
    expect(contactsImports).toHaveLength(1);

    await scheduledPolls.get(60 * 1000)?.();
    expect(contactsImports).toHaveLength(1);

    const dailyContactsImport = scheduledPolls.get(24 * 60 * 60 * 1000);
    expect(dailyContactsImport).toBeDefined();
    await dailyContactsImport?.();
    expect(contactsImports).toEqual([
      { accountEmail: 'francisco@example.com', contacts: [] },
      { accountEmail: 'francisco@example.com', contacts: [] },
    ]);
  });

  it('after the first Gmail poll, reads in full each message the backend lists as missing a body for the profile account and reports the bodies', async () => {
    const bodiesReports: unknown[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${gmailApi}/users/me/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '4321' }));
      }
      if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
        return Promise.resolve(Response.json({ messages: [] }));
      }
      if (url.href === `${gmailApi}/users/me/messages/older?format=full`) {
        return Promise.resolve(
          Response.json({
            id: 'older',
            threadId: 'thread-older',
            labelIds: ['INBOX'],
            snippet: 'Agenda attached.',
            payload: {
              headers: [
                { name: 'From', value: 'Board <board@lists.example.com>' },
                { name: 'To', value: 'francisco@example.com' },
                { name: 'Subject', value: 'Weekly board digest' },
                { name: 'Date', value: 'Fri, 6 Nov 2026 08:00:00 -0600' },
              ],
              mimeType: 'text/plain',
              body: { size: 16, data: Buffer.from('Agenda attached.').toString('base64url') },
            },
          }),
        );
      }
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Promise.resolve(Response.json({ kind: 'calendar#calendarList', items: [] }));
      }
      if (url.href.startsWith('http://127.0.0.1:7777/commands?')) {
        return Promise.resolve(Response.json({ commands: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/bodies-missing?account=francisco%40example.com') {
        return Promise.resolve(Response.json({ messageIds: ['older'] }));
      }
      if (url.href === `${peopleApi}/contactGroups`) {
        return Promise.resolve(Response.json({ contactGroups: [] }));
      }
      if (url.href.startsWith(`${peopleApi}/people/me/connections`)) {
        return Promise.resolve(Response.json({ connections: [] }));
      }
      if (url.href.startsWith(`${peopleApi}/otherContacts`)) {
        return Promise.resolve(Response.json({ otherContacts: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/bodies-report' && init?.method === 'POST') {
        bodiesReports.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: () => Promise.resolve('francisco@example.com'),
      accessToken: () => Promise.resolve('token-for-francisco'),
      backendUrl: 'http://127.0.0.1:7777',
      clock: () => new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(bodiesReports).toEqual([
      { accountEmail: 'francisco@example.com', bodies: [{ messageId: 'older', body: 'Agenda attached.' }] },
    ]);
  });
});
