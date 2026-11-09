import { describe, expect, it, vi } from 'vitest';

import { startExtension } from './extension-start';

const calendarApi = 'https://www.googleapis.com/calendar/v3';
const gmailApi = 'https://gmail.googleapis.com/gmail/v1';
const peopleApi = 'https://people.googleapis.com/v1';
const backendApi = 'http://127.0.0.1:7777';
const profileEmail = 'francisco@example.com';
const calendarListUrl = `${calendarApi}/users/me/calendarList`;
const pendingCommandsUrl = `${backendApi}/commands?accountEmail=${encodeURIComponent(profileEmail)}`;

const oneMinute = 60 * 1000;
const fiveMinutes = 5 * oneMinute;
const oneDay = 24 * 60 * oneMinute;

const jsonResponse = (body: unknown): Promise<Response> => Promise.resolve(Response.json(body));

const requestUrl = (input: string | URL | Request): URL =>
  new URL(input instanceof Request ? input.url : input.toString());
const routedFetch =
  (route: (url: URL, init?: RequestInit) => Promise<Response>) =>
  (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    route(requestUrl(input), init);

const requestBody = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
interface BackendPost {
  path: string;
  body: unknown;
}
const backendPost = (url: URL, init: RequestInit): BackendPost => ({ path: url.pathname, body: requestBody(init) });

const isBackendPost = (url: URL, init?: RequestInit): init is RequestInit =>
  url.origin === backendApi && init?.method === 'POST';
const isBackendPostTo = (path: string, url: URL, init?: RequestInit): init is RequestInit =>
  isBackendPost(url, init) && url.pathname === path;

const acceptedRequest = () => jsonResponse({ ok: true });
const registerPost: BackendPost = { path: '/register', body: { email: profileEmail } };
const emptyCalendarSnapshotPost: BackendPost = {
  path: '/calendar-snapshot',
  body: { accountEmail: profileEmail, events: [] },
};
const recordBody = (into: unknown[], init: RequestInit): Promise<Response> => {
  into.push(requestBody(init));
  return acceptedRequest();
};
const unexpectedRequest = () => Promise.resolve(new Response('unexpected request', { status: 404 }));
const emptyCalendarList = () => jsonResponse({ kind: 'calendar#calendarList', items: [] });
const gmailProfile = () => jsonResponse({ emailAddress: profileEmail, historyId: '4321' });
const emptyInbox = () => jsonResponse({ messages: [] });
const isGmailHistoryRead = (url: URL): boolean => url.href.startsWith(`${gmailApi}/users/me/history`);
const isGmailLabelsRead = (url: URL, init?: RequestInit): boolean =>
  url.href === `${gmailApi}/users/me/labels` && init?.method !== 'POST';
const unchangedHistory = () => jsonResponse({ historyId: '4321' });
const noPendingCommands = () => jsonResponse({ commands: [] });
const isAcknowledgementPost = (url: URL, init?: RequestInit): boolean =>
  url.pathname.endsWith('/acknowledgement') && init?.method === 'POST';
const recordingBackendPosts =
  (backendPosts: BackendPost[]) =>
  (url: URL, init?: RequestInit): Promise<Response> => {
    if (url.href === calendarListUrl) {
      return emptyCalendarList();
    }
    if (isBackendPost(url, init)) {
      backendPosts.push(backendPost(url, init));
      return acceptedRequest();
    }
    return unexpectedRequest();
  };
const defaultRoute = (url: URL, init?: RequestInit): Promise<Response> => {
  if (url.href === calendarListUrl) {
    return emptyCalendarList();
  }
  if (url.href === `${gmailApi}/users/me/profile`) {
    return gmailProfile();
  }
  if (url.href === `${gmailApi}/users/me/messages?labelIds=INBOX`) {
    return emptyInbox();
  }
  if (isGmailHistoryRead(url)) {
    return unchangedHistory();
  }
  if (url.href === pendingCommandsUrl) {
    return noPendingCommands();
  }
  if (url.href === `${peopleApi}/contactGroups`) {
    return jsonResponse({ contactGroups: [] });
  }
  if (url.href.startsWith(`${peopleApi}/people/me/connections`)) {
    return jsonResponse({ connections: [] });
  }
  if (url.href.startsWith(`${peopleApi}/otherContacts`)) {
    return jsonResponse({ otherContacts: [] });
  }
  if (isBackendPost(url, init)) {
    return acceptedRequest();
  }
  return unexpectedRequest();
};
const recordingPostsTo =
  (path: string, into: unknown[]) =>
  (url: URL, init?: RequestInit): Promise<Response> =>
    isBackendPostTo(path, url, init) ? recordBody(into, init) : defaultRoute(url, init);

const startOptions = (fetch: typeof globalThis.fetch) => ({
  fetch,
  profileAccountEmail: () => Promise.resolve(profileEmail),
  accessToken: () => Promise.resolve('token-for-francisco'),
  backendUrl: backendApi,
  clock: () => new Date('2026-11-02T10:00:00-06:00'),
  timeZone: 'America/Mexico_City',
});

const collectInto =
  (scheduledPolls: Map<number, () => Promise<void>>) => (milliseconds: number, poll: () => Promise<void>) => {
    scheduledPolls.set(milliseconds, poll);
  };

const startWithScheduledPolls = async (
  fetch: typeof globalThis.fetch,
  overrides: Partial<Parameters<typeof startExtension>[0]> = {},
): Promise<Map<number, () => Promise<void>>> => {
  const scheduledPolls = new Map<number, () => Promise<void>>();
  await startExtension({ ...startOptions(fetch), ...overrides, every: collectInto(scheduledPolls) });
  return scheduledPolls;
};

describe('startExtension', () => {
  it('registers with the backend using the profile account email, then posts the first snapshot', async () => {
    const backendPosts: BackendPost[] = [];
    const fakeFetch = routedFetch(recordingBackendPosts(backendPosts));

    await startExtension(startOptions(fakeFetch));

    expect(backendPosts).toEqual([registerPost, emptyCalendarSnapshotPost]);
  });

  it('polls again every 5 minutes after the first snapshot and posts each result, and a failed poll does not stop the next one', async () => {
    const backendPosts: BackendPost[] = [];
    let calendarListRequests = 0;
    const fakeFetch = routedFetch((url, init) => {
      if (url.href === calendarListUrl) {
        calendarListRequests++;
        if (calendarListRequests === 2) {
          return Promise.resolve(new Response('forbidden', { status: 403 }));
        }
      }
      return recordingBackendPosts(backendPosts)(url, init);
    });
    const scheduledPolls = await startWithScheduledPolls(fakeFetch);
    const calendarPoll = scheduledPolls.get(fiveMinutes);

    expect(calendarPoll).toBeDefined();
    await expect(calendarPoll?.()).resolves.toBeUndefined();
    await expect(calendarPoll?.()).resolves.toBeUndefined();
    expect(backendPosts).toEqual([registerPost, emptyCalendarSnapshotPost, emptyCalendarSnapshotPost]);
  });

  it('requests the Calendar window for the moment of each scheduled poll, so a poll the next day asks for the next day', async () => {
    const requestedWindows: { timeMin: string | null; timeMax: string | null }[] = [];
    const fakeFetch = routedFetch((url, init) => {
      if (url.href === calendarListUrl) {
        return jsonResponse({ kind: 'calendar#calendarList', items: [{ id: 'primary', summary: 'Francisco' }] });
      }
      if (url.pathname === '/calendar/v3/calendars/primary/events') {
        requestedWindows.push({ timeMin: url.searchParams.get('timeMin'), timeMax: url.searchParams.get('timeMax') });
        return jsonResponse({ kind: 'calendar#events', items: [] });
      }
      return defaultRoute(url, init);
    });
    let currentTime = new Date('2026-11-02T10:00:00-06:00');
    const scheduledPolls = await startWithScheduledPolls(fakeFetch, { clock: () => currentTime });
    currentTime = new Date('2026-11-03T09:00:00-06:00');
    await scheduledPolls.get(fiveMinutes)?.();

    expect(requestedWindows).toEqual([
      { timeMin: '2026-11-02T06:00:00.000Z', timeMax: '2026-11-04T06:00:00.000Z' },
      { timeMin: '2026-11-03T06:00:00.000Z', timeMax: '2026-11-05T06:00:00.000Z' },
    ]);
  });

  it('refreshes the badge from GET /now after the first snapshot and after every scheduled poll', async () => {
    const badgeCounts = [1, 3];
    const fakeFetch = routedFetch((url, init) => {
      if (url.href === `${backendApi}/now` && init?.method !== 'POST') {
        return jsonResponse({ badgeCount: badgeCounts.shift() });
      }
      return defaultRoute(url, init);
    });
    const badgeTexts: string[] = [];
    const scheduledPolls = await startWithScheduledPolls(fakeFetch, {
      setBadgeText: (text: string) => {
        badgeTexts.push(text);
        return Promise.resolve();
      },
    });
    const badgeTextsAfterStart = [...badgeTexts];
    await scheduledPolls.get(fiveMinutes)?.();

    expect(badgeTextsAfterStart).toEqual(['1']);
    expect(badgeTexts).toEqual(['1', '3']);
  });

  it('posts the Gmail report to the backend with the profile account email', async () => {
    const mailReports: unknown[] = [];
    const fakeFetch = routedFetch(recordingPostsTo('/mail-report', mailReports));

    await startExtension(startOptions(fakeFetch));

    expect(mailReports).toEqual([{ accountEmail: profileEmail, historyId: '4321', messages: [] }]);
  });

  it('still starts and posts the calendar snapshot when Gmail is unreachable, reporting the Gmail failure to the console', async () => {
    const backendPosts: BackendPost[] = [];
    const gmailUnreachable = new TypeError('Failed to fetch');
    const fakeFetch = routedFetch((url, init) => {
      if (url.origin === 'https://gmail.googleapis.com') {
        return Promise.reject(gmailUnreachable);
      }
      return recordingBackendPosts(backendPosts)(url, init);
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(startExtension(startOptions(fakeFetch))).resolves.toBeUndefined();

      expect(backendPosts).toContainEqual(emptyCalendarSnapshotPost);
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), gmailUnreachable);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('polls Gmail again every 60 seconds and posts each mail report', async () => {
    const mailReports: unknown[] = [];
    const fakeFetch = routedFetch(recordingPostsTo('/mail-report', mailReports));
    const scheduledPolls = await startWithScheduledPolls(fakeFetch);
    const gmailPoll = scheduledPolls.get(oneMinute);
    await gmailPoll?.();

    expect(gmailPoll).toBeDefined();
    expect(mailReports).toHaveLength(2);
  });

  it('starts the second scheduled Gmail poll from the history id the first poll reported, not from an empty inbox read', async () => {
    const gmailReads: string[] = [];
    const fakeFetch = routedFetch((url, init) => {
      if (url.origin === 'https://gmail.googleapis.com') {
        gmailReads.push(url.pathname + url.search);
      }
      return defaultRoute(url, init);
    });
    const scheduledPolls = await startWithScheduledPolls(fakeFetch);
    gmailReads.length = 0;
    await scheduledPolls.get(oneMinute)?.();

    expect(gmailReads).toContain('/gmail/v1/users/me/history?startHistoryId=4321');
    expect(gmailReads).not.toContain('/gmail/v1/users/me/messages?labelIds=INBOX');
  });

  it('reports a failed scheduled Gmail poll to the console, and the next scheduled poll still posts a mail report', async () => {
    const mailReports: unknown[] = [];
    const gmailUnreachable = new TypeError('Failed to fetch');
    let historyReads = 0;
    const fakeFetch = routedFetch((url, init) => {
      if (isGmailHistoryRead(url)) {
        historyReads++;
        if (historyReads === 1) {
          return Promise.reject(gmailUnreachable);
        }
        return unchangedHistory();
      }
      return recordingPostsTo('/mail-report', mailReports)(url, init);
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const scheduledPolls = await startWithScheduledPolls(fakeFetch);
      const gmailPoll = scheduledPolls.get(oneMinute);
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
    const fakeFetch = routedFetch((url, init) => {
      if (isGmailLabelsRead(url, init)) {
        return jsonResponse({ labels: [{ id: 'Label_9', name: 'my-life/archived' }] });
      }
      if (url.pathname.endsWith('/modify') && init?.method === 'POST') {
        gmailModifications.push(url.pathname);
        return jsonResponse({ id: 'message-7' });
      }
      if (url.href === pendingCommandsUrl) {
        return jsonResponse({ commands: [{ id: 'command-1', messageId: 'message-7' }] });
      }
      if (isAcknowledgementPost(url, init)) {
        acknowledgements.push(url.pathname);
        return acceptedRequest();
      }
      return defaultRoute(url, init);
    });

    await startExtension(startOptions(fakeFetch));

    expect(gmailModifications).toEqual(['/gmail/v1/users/me/messages/message-7/modify']);
    expect(acknowledgements).toEqual(['/commands/command-1/acknowledgement']);
  });

  it('after the first Gmail poll, carries out a pending undo-automatic command by removing my-life/auto from the message and returning it to the inbox, and acknowledges it', async () => {
    const gmailModifications: { path: string; body: unknown }[] = [];
    const acknowledgements: string[] = [];
    const fakeFetch = routedFetch((url, init) => {
      if (isGmailLabelsRead(url, init)) {
        return jsonResponse({ labels: [{ id: 'Label_auto', name: 'my-life/auto' }] });
      }
      if (url.pathname.endsWith('/modify') && init?.method === 'POST') {
        gmailModifications.push({ path: url.pathname, body: requestBody(init) });
        return jsonResponse({ id: 'message-7' });
      }
      if (url.href === pendingCommandsUrl) {
        return jsonResponse({
          commands: [
            { id: 'undo-automatic-message-7', type: 'undo-automatic', messageId: 'message-7', label: 'my-life/auto' },
          ],
        });
      }
      if (isAcknowledgementPost(url, init)) {
        acknowledgements.push(url.pathname);
        return acceptedRequest();
      }
      return defaultRoute(url, init);
    });

    await startExtension(startOptions(fakeFetch));

    expect(gmailModifications).toEqual([
      {
        path: '/gmail/v1/users/me/messages/message-7/modify',
        body: { removeLabelIds: ['Label_auto'], addLabelIds: ['INBOX'] },
      },
    ]);
    expect(acknowledgements).toEqual(['/commands/undo-automatic-message-7/acknowledgement']);
  });

  it('after the first Gmail poll, creates and deletes the Gmail filters the pending create-filter and delete-filter commands ask for, and acknowledges both', async () => {
    const gmailFilterRequests: { method: string | undefined; path: string; body: unknown }[] = [];
    const acknowledgements: BackendPost[] = [];
    const fakeFetch = routedFetch((url, init) => {
      const body = requestBody(init);
      if (isGmailLabelsRead(url, init)) {
        return jsonResponse({ labels: [{ id: 'Label_99', name: 'my-life/shop' }] });
      }
      if (url.pathname.startsWith('/gmail/v1/users/me/settings/filters')) {
        gmailFilterRequests.push({ method: init?.method, path: url.pathname, body });
        if (init?.method === 'POST') {
          return jsonResponse({ id: 'gmail-filter-7', ...(body as object) });
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.href === pendingCommandsUrl) {
        return jsonResponse({
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
        });
      }
      if (isAcknowledgementPost(url, init)) {
        acknowledgements.push({ path: url.pathname, body });
        return acceptedRequest();
      }
      return defaultRoute(url, init);
    });

    await startExtension(startOptions(fakeFetch));

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

  it('carries out a pending create-draft command by creating a Gmail draft in its thread, never sending it, beside an archive command, and acknowledges the draft only once Gmail created it', async () => {
    const events: string[] = [];
    const createdDrafts: { threadId: string; raw: string }[] = [];
    const acknowledgedCommandIds = new Set<string>();
    let gmailRefusesNextDraft = true;
    const pendingCommands = [
      { id: 'command-1', messageId: 'message-7' },
      {
        id: 'draft-message-1',
        type: 'create-draft',
        threadId: 'thread-1',
        to: ['luis@example.com'],
        subject: 'Re: Budget review',
        body: 'I will review it by Friday.',
      },
    ];
    const fakeFetch = routedFetch((url, init) => {
      if (url.origin === 'https://gmail.googleapis.com' && url.pathname.includes('/send')) {
        events.push(`send ${url.pathname}`);
        return jsonResponse({});
      }
      if (isGmailLabelsRead(url, init)) {
        return jsonResponse({ labels: [{ id: 'Label_9', name: 'my-life/archived' }] });
      }
      if (url.pathname.endsWith('/modify') && init?.method === 'POST') {
        events.push(`modify ${url.pathname}`);
        return jsonResponse({ id: 'message-7' });
      }
      if (url.href === `${gmailApi}/users/me/drafts` && init?.method === 'POST') {
        if (gmailRefusesNextDraft) {
          gmailRefusesNextDraft = false;
          events.push('draft refused');
          return Promise.resolve(Response.json({ error: { code: 500, message: 'Backend Error' } }, { status: 500 }));
        }
        const { message } = requestBody(init) as { message: { threadId: string; raw: string } };
        createdDrafts.push(message);
        events.push('draft created');
        return jsonResponse({ id: 'gmail-draft-1', message: { id: 'draft-message', threadId: message.threadId } });
      }
      if (url.href === pendingCommandsUrl) {
        return jsonResponse({ commands: pendingCommands.filter((command) => !acknowledgedCommandIds.has(command.id)) });
      }
      if (isAcknowledgementPost(url, init)) {
        const commandId = url.pathname.split('/')[2] ?? '';
        acknowledgedCommandIds.add(commandId);
        events.push(`acknowledge ${commandId}`);
        return acceptedRequest();
      }
      return defaultRoute(url, init);
    });

    const scheduledPolls = await startWithScheduledPolls(fakeFetch);
    await scheduledPolls.get(oneMinute)?.();

    expect(events).toEqual([
      'modify /gmail/v1/users/me/messages/message-7/modify',
      'acknowledge command-1',
      'draft refused',
      'draft created',
      'acknowledge draft-message-1',
    ]);
    expect(createdDrafts.map(({ threadId }) => threadId)).toEqual(['thread-1']);
    const draftMessage = Buffer.from(createdDrafts[0]?.raw ?? '', 'base64url').toString('utf8');
    expect(draftMessage).toContain('To: luis@example.com');
    expect(draftMessage).toContain('Subject: Re: Budget review');
    expect(draftMessage).toContain('I will review it by Friday.');
  });

  it('imports the Google Contacts at start and again once a day, and a scheduled Gmail poll imports none', async () => {
    const contactsImports: unknown[] = [];
    const fakeFetch = routedFetch(recordingPostsTo('/contacts-import', contactsImports));
    const scheduledPolls = await startWithScheduledPolls(fakeFetch);
    expect(contactsImports).toHaveLength(1);

    await scheduledPolls.get(oneMinute)?.();
    expect(contactsImports).toHaveLength(1);

    const dailyContactsImport = scheduledPolls.get(oneDay);
    expect(dailyContactsImport).toBeDefined();
    await dailyContactsImport?.();
    expect(contactsImports).toEqual([
      { accountEmail: profileEmail, contacts: [] },
      { accountEmail: profileEmail, contacts: [] },
    ]);
  });

  it('after the first Gmail poll, reads in full each message the backend lists as missing a body for the profile account and reports the bodies', async () => {
    const bodiesReports: unknown[] = [];
    const fakeFetch = routedFetch((url, init) => {
      if (url.href === `${gmailApi}/users/me/messages/older?format=full`) {
        return jsonResponse({
          id: 'older',
          threadId: 'thread-older',
          labelIds: ['INBOX'],
          snippet: 'Agenda attached.',
          payload: {
            headers: [
              { name: 'From', value: 'Board <board@lists.example.com>' },
              { name: 'To', value: profileEmail },
              { name: 'Subject', value: 'Weekly board digest' },
              { name: 'Date', value: 'Fri, 6 Nov 2026 08:00:00 -0600' },
            ],
            mimeType: 'text/plain',
            body: { size: 16, data: Buffer.from('Agenda attached.').toString('base64url') },
          },
        });
      }
      if (url.href === `${backendApi}/bodies-missing?account=${encodeURIComponent(profileEmail)}`) {
        return jsonResponse({ messageIds: ['older'] });
      }
      return recordingPostsTo('/bodies-report', bodiesReports)(url, init);
    });

    await startExtension(startOptions(fakeFetch));

    expect(bodiesReports).toEqual([
      { accountEmail: profileEmail, bodies: [{ messageId: 'older', body: 'Agenda attached.' }] },
    ]);
  });
});
