import { describe, expect, it } from 'vitest';

import { openSlackMessageStore } from './slack-message-store';
import { pollSlackWorkspace, pollSlackWorkspaces } from './slack-poll';

type SlackRoute = (url: URL) => unknown;

const ownSlackUserId = 'UOWN';
const workspace = { teamId: 'T0001', userToken: 'xoxp-test' };

// A Slack Web API answered from a table of routes; anything not routed answers as an empty workspace would.
function scriptedSlack(routes: Record<string, SlackRoute> = {}) {
  const requests: URL[] = [];
  const defaults: Record<string, SlackRoute> = {
    '/auth.test': () => ({ ok: true, user_id: ownSlackUserId }),
    '/search.messages': () => ({ ok: true, messages: { matches: [] } }),
    '/users.info': (url) => ({
      ok: true,
      user: { profile: { display_name: `Name of ${String(url.searchParams.get('user'))}` } },
    }),
  };
  const fetch: typeof globalThis.fetch = (request) => {
    const url = new URL(request instanceof Request ? request.url : request.toString());
    requests.push(url);
    const route = routes[url.pathname] ?? defaults[url.pathname];
    const answer = route?.(url) ?? { ok: false, error: 'unknown_method' };
    return Promise.resolve(answer instanceof Response ? answer : Response.json(answer));
  };
  return { fetch, requests };
}

const pollWith = (slack: ReturnType<typeof scriptedSlack>, store = openSlackMessageStore(':memory:')) =>
  pollSlackWorkspace({ fetch: slack.fetch, apiUrl: 'https://slack.test', workspace, store, clock: pollClock }).then(
    () => store,
  );

const pollClock = { now: () => new Date('2026-11-10T18:00:00.000Z') };

// A search answering the given matches to a query that starts with the given prefix; every other search finds nothing.
const searchAnswering =
  (queryPrefix: string, matches: unknown[]): SlackRoute =>
  (url) =>
    url.searchParams.get('query')?.startsWith(queryPrefix) === true
      ? { ok: true, messages: { matches } }
      : { ok: true, messages: { matches: [] } };

// An is:dm search answering one match in the given DM conversation; every other search finds nothing.
const directMessageSearchNaming = (conversationId: string): SlackRoute =>
  searchAnswering('is:dm', [{ ts: '1762700000.000100', channel: { id: conversationId } }]);

describe('pollSlackWorkspace', () => {
  it("stores each DM message with its workspace, conversation, sender, the sender's display name, text and timestamp", async () => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [{ user: 'U0001', text: 'Can you look at the contract today?', ts: '1762700000.000100' }],
      }),
    });

    const store = await pollWith(slack);

    expect(store.listMessages()).toEqual([
      expect.objectContaining({
        workspaceTeamId: 'T0001',
        conversationId: 'D0001',
        senderUserId: 'U0001',
        senderName: 'Name of U0001',
        text: 'Can you look at the contract today?',
        timestamp: '1762700000.000100',
      }),
    ]);
  });

  it('stores a DM message the user sent as sent by the user', async () => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [{ user: ownSlackUserId, text: 'On it.', ts: '1762700100.000200' }],
      }),
    });

    const store = await pollWith(slack);

    expect(store.listMessages()).toEqual([expect.objectContaining({ senderUserId: ownSlackUserId, sentByUser: true })]);
  });

  it('asks conversations.history on a second poll only for messages newer than the newest stored in that conversation', async () => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [{ user: 'U0001', text: 'Can you look at the contract today?', ts: '1762700000.000100' }],
      }),
    });
    const store = await pollWith(slack);
    slack.requests.length = 0;

    await pollWith(slack, store);

    const historyRequests = slack.requests.filter((url) => url.pathname === '/conversations.history');
    expect(historyRequests.map((url) => url.searchParams.get('oldest'))).toEqual(['1762700000.000100']);
  });

  it('asks conversations.history for a conversation with nothing stored only for messages from 7 days before now', async () => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({ ok: true, messages: [] }),
    });

    await pollWith(slack);

    const historyRequests = slack.requests.filter((url) => url.pathname === '/conversations.history');
    const sevenDaysBeforePollClockInSeconds = Date.parse('2026-11-03T18:00:00.000Z') / 1000;
    expect(historyRequests.map((url) => Number(url.searchParams.get('oldest')))).toEqual([
      sevenDaysBeforePollClockInSeconds,
    ]);
  });

  it('asks conversations.history for a conversation with nothing stored only for messages from 3 days before now when the first-poll lookback is 3 days', async () => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({ ok: true, messages: [] }),
    });

    await pollSlackWorkspace({
      fetch: slack.fetch,
      apiUrl: 'https://slack.test',
      workspace,
      store: openSlackMessageStore(':memory:'),
      clock: pollClock,
      firstPollLookbackDays: 3,
    });

    const historyRequests = slack.requests.filter((url) => url.pathname === '/conversations.history');
    const threeDaysBeforePollClockInSeconds = Date.parse('2026-11-07T18:00:00.000Z') / 1000;
    expect(historyRequests.map((url) => Number(url.searchParams.get('oldest')))).toEqual([
      threeDaysBeforePollClockInSeconds,
    ]);
  });

  it.each([
    { search: 'is:dm', queryPrefix: 'is:dm' },
    { search: "mentions of the user's own Slack id", queryPrefix: `<@${ownSlackUserId}>` },
    { search: "the user's own messages", queryPrefix: `from:<@${ownSlackUserId}>` },
  ])(
    'searches for $search after the date 3 days before now when the first-poll lookback is 3 days',
    async ({ queryPrefix }) => {
      const slack = scriptedSlack();

      await pollSlackWorkspace({
        fetch: slack.fetch,
        apiUrl: 'https://slack.test',
        workspace,
        store: openSlackMessageStore(':memory:'),
        clock: pollClock,
        firstPollLookbackDays: 3,
      });

      const queries = slack.requests
        .filter((url) => url.pathname === '/search.messages')
        .map((url) => url.searchParams.get('query'))
        .filter((query) => query?.startsWith(queryPrefix) === true);
      expect(queries).toEqual([`${queryPrefix} after:2026-11-07`]);
    },
  );

  it('stores the messages of a DM conversation that an is:dm search after the date 7 days before now names, though conversations.list does not list it', async () => {
    const slack = scriptedSlack({
      '/conversations.list': () => ({ ok: true, channels: [] }),
      '/search.messages': (url) =>
        url.searchParams.get('query') === 'is:dm after:2026-11-03'
          ? {
              ok: true,
              messages: {
                matches: [
                  { user: 'U0002', text: 'Ping', ts: '1762780000.000100', channel: { id: 'D0002', is_im: true } },
                ],
              },
            }
          : { ok: true, messages: { matches: [] } },
      '/conversations.history': (url) =>
        url.searchParams.get('channel') === 'D0002'
          ? { ok: true, messages: [{ user: 'U0002', text: 'Are we still on for Friday?', ts: '1762780000.000100' }] }
          : { ok: false, error: 'channel_not_found' },
    });
    const store = openSlackMessageStore(':memory:');

    await pollWith(slack, store);

    expect(store.listMessages()).toEqual([
      expect.objectContaining({ conversationId: 'D0002', senderUserId: 'U0002', text: 'Are we still on for Friday?' }),
    ]);
  });

  it('does not read the history of a DM conversation that no is:dm match names', async () => {
    const slack = scriptedSlack({
      '/conversations.list': () => ({ ok: true, channels: [{ id: 'D0001' }] }),
      '/search.messages': () => ({ ok: true, messages: { matches: [] } }),
      '/conversations.history': () => ({
        ok: true,
        messages: [{ user: 'U0001', text: 'Can you look at the contract today?', ts: '1762700000.000100' }],
      }),
    });

    await pollWith(slack);

    const historyRequests = slack.requests.filter((url) => url.pathname === '/conversations.history');
    expect(historyRequests.map((url) => url.searchParams.get('channel'))).toEqual([]);
  });

  it('reads the history of a DM conversation once though several is:dm matches name it', async () => {
    const slack = scriptedSlack({
      '/search.messages': searchAnswering('is:dm', [
        { user: 'U0002', text: 'Ping', ts: '1762780000.000200', channel: { id: 'D0002' } },
        { user: 'U0002', text: 'Hello?', ts: '1762770000.000100', channel: { id: 'D0002' } },
      ]),
      '/conversations.history': () => ({ ok: true, messages: [] }),
    });

    await pollWith(slack);

    expect(slack.requests.filter((url) => url.pathname === '/conversations.history')).toHaveLength(1);
  });

  it('never calls conversations.list', async () => {
    const slack = scriptedSlack();

    await pollWith(slack);

    expect(slack.requests.map((url) => url.pathname)).not.toContain('/conversations.list');
  });

  it('requests the next search.messages page when every match on the current page is newer than the newest stored message', async () => {
    const store = openSlackMessageStore(':memory:');
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Name of U0001',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
      sentByUser: false,
    });
    const slack = scriptedSlack({
      '/search.messages': (url) =>
        url.searchParams.get('query')?.startsWith('is:dm') === true && url.searchParams.get('page') !== '2'
          ? {
              ok: true,
              messages: {
                matches: [
                  { user: 'U0002', text: 'Ping', ts: '1762780000.000200', channel: { id: 'D0002' } },
                  { user: 'U0003', text: 'Hello', ts: '1762770000.000100', channel: { id: 'D0003' } },
                ],
                paging: { page: 1, pages: 2 },
              },
            }
          : { ok: true, messages: { matches: [], paging: { page: 2, pages: 2 } } },
      '/conversations.history': () => ({ ok: true, messages: [] }),
    });

    await pollWith(slack, store);

    const directMessageSearchPages = slack.requests
      .filter((url) => url.pathname === '/search.messages' && url.searchParams.get('query')?.startsWith('is:dm'))
      .map((url) => url.searchParams.get('page'));
    expect(directMessageSearchPages).toContain('2');
  });

  it('requests no further search.messages page once a page holds a match older than the newest stored message', async () => {
    const store = openSlackMessageStore(':memory:');
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Name of U0001',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
      sentByUser: false,
    });
    const pageMatches: Record<string, { user: string; text: string; ts: string; channel: { id: string } }[]> = {
      '1': [{ user: 'U0002', text: 'Ping', ts: '1762780000.000200', channel: { id: 'D0002' } }],
      '2': [{ user: 'U0003', text: 'Hello', ts: '1762770000.000100', channel: { id: 'D0003' } }],
      '3': [
        { user: 'U0004', text: 'Lunch?', ts: '1762760000.000100', channel: { id: 'D0004' } },
        { user: 'U0005', text: 'Old news', ts: '1762600000.000100', channel: { id: 'D0005' } },
      ],
      '4': [{ user: 'U0006', text: 'Older still', ts: '1762500000.000100', channel: { id: 'D0006' } }],
    };
    const slack = scriptedSlack({
      '/search.messages': (url) => {
        if (url.searchParams.get('query')?.startsWith('is:dm') !== true) {
          return { ok: true, messages: { matches: [] } };
        }
        const page = url.searchParams.get('page') ?? '1';
        return { ok: true, messages: { matches: pageMatches[page] ?? [], paging: { page: Number(page), pages: 4 } } };
      },
      '/conversations.history': () => ({ ok: true, messages: [] }),
    });

    await pollWith(slack, store);

    const directMessageSearchPages = slack.requests
      .filter((url) => url.pathname === '/search.messages' && url.searchParams.get('query')?.startsWith('is:dm'))
      .map((url) => url.searchParams.get('page') ?? '1');
    expect(directMessageSearchPages).toEqual(['1', '2', '3']);
  });

  it('requests no search.messages page past the last page Slack names, though every match on it is newer than anything stored', async () => {
    const slack = scriptedSlack({
      '/search.messages': (url) =>
        url.searchParams.get('query')?.startsWith('is:dm') === true
          ? {
              ok: true,
              messages: {
                matches: [{ user: 'U0002', text: 'Ping', ts: '1762780000.000200', channel: { id: 'D0002' } }],
                paging: { page: Number(url.searchParams.get('page') ?? '1'), pages: 2 },
              },
            }
          : { ok: true, messages: { matches: [] } },
      '/conversations.history': () => ({ ok: true, messages: [] }),
    });

    await pollWith(slack);

    const directMessageSearches = slack.requests.filter(
      (url) => url.pathname === '/search.messages' && url.searchParams.get('query')?.startsWith('is:dm'),
    );
    expect(directMessageSearches).toHaveLength(2);
  });

  it.each([
    {
      when: 'their Slack profile has no display name',
      usersInfoAnswer: { ok: true, user: { profile: {} } },
      senderName: 'U0009',
    },
    {
      when: 'users.info cannot find the sender, and keeps polling',
      usersInfoAnswer: { ok: false, error: 'user_not_found' },
      senderName: 'U0009',
    },
    {
      when: 'Slack answers an empty display name, as the real name',
      usersInfoAnswer: { ok: true, user: { profile: { display_name: '', real_name: 'Ana Ruiz' } } },
      senderName: 'Ana Ruiz',
    },
  ])("stores a message's sender name as $senderName when $when", async ({ usersInfoAnswer, senderName }) => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [{ user: 'U0009', text: 'Hi', ts: '1762700000.000100' }],
      }),
      '/users.info': () => usersInfoAnswer,
    });

    const store = await pollWith(slack);

    expect(store.listMessages()).toEqual([expect.objectContaining({ senderUserId: 'U0009', senderName })]);
  });

  it("stores an app's message, which has no user but a bot id and a username, under the bot id and the username", async () => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [
          {
            subtype: 'bot_message',
            bot_id: 'B0001',
            username: 'Deploy Bot',
            text: 'Deploy finished.',
            ts: '1762700000.000100',
          },
        ],
      }),
    });

    const store = await pollWith(slack);

    expect(store.listMessages()).toEqual([
      expect.objectContaining({ senderUserId: 'B0001', senderName: 'Deploy Bot' }),
    ]);
  });

  it('asks users.info once for a sender who wrote two messages in one poll', async () => {
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [
          { user: 'U0001', text: 'Can you look at the contract today?', ts: '1762700000.000100' },
          { user: 'U0001', text: 'It is the one from Monday.', ts: '1762700050.000150' },
        ],
      }),
    });

    await pollWith(slack);

    const usersInfoRequests = slack.requests.filter((url) => url.pathname === '/users.info');
    expect(usersInfoRequests.map((url) => url.searchParams.get('user'))).toEqual(['U0001']);
  });

  it('asks auth.test once per workspace poll', async () => {
    const slack = scriptedSlack();

    await pollWith(slack);

    expect(slack.requests.filter((url) => url.pathname === '/auth.test')).toHaveLength(1);
  });

  it("finds mentions by searching for the user's own Slack id and stores each match under its channel", async () => {
    const mention = {
      user: 'U0002',
      text: `<@${ownSlackUserId}> can you approve the invoice?`,
      ts: '1762700100.000200',
    };
    const slack = scriptedSlack({
      '/search.messages': searchAnswering(`<@${ownSlackUserId}>`, [{ ...mention, channel: { id: 'C0001' } }]),
    });

    const store = await pollWith(slack);

    expect(store.listMessages()).toEqual([
      expect.objectContaining({
        conversationId: 'C0001',
        senderUserId: 'U0002',
        text: mention.text,
        timestamp: mention.ts,
      }),
    ]);
  });

  it('asks every search for the newest messages first, not the most relevant', async () => {
    const slack = scriptedSlack();

    await pollWith(slack);

    const searchRequests = slack.requests.filter((url) => url.pathname === '/search.messages');
    expect(searchRequests.length).toBeGreaterThan(0);
    for (const url of searchRequests) {
      expect([url.searchParams.get('sort'), url.searchParams.get('sort_dir')]).toEqual(['timestamp', 'desc']);
    }
  });

  it('asks every search for 100 matches a page, the most Slack gives, so a busy week of DMs takes few requests', async () => {
    const slack = scriptedSlack();

    await pollWith(slack);

    const searchRequests = slack.requests.filter((url) => url.pathname === '/search.messages');
    expect(searchRequests.map((url) => url.searchParams.get('count'))).toEqual(searchRequests.map(() => '100'));
  });

  it('stores a mention match the user sent themselves as sent by the user', async () => {
    const slack = scriptedSlack({
      '/search.messages': searchAnswering(`<@${ownSlackUserId}>`, [
        {
          user: ownSlackUserId,
          text: `Note to self <@${ownSlackUserId}>`,
          ts: '1762700100.000200',
          channel: { id: 'C0001' },
        },
      ]),
    });

    const store = await pollWith(slack);

    expect(store.listMessages()).toEqual([expect.objectContaining({ senderUserId: ownSlackUserId, sentByUser: true })]);
  });

  it("fetches replies only for threads the user wrote in, and stores each reply with its thread, marking the user's own as sent by them", async () => {
    const ownMessagesQuery = `from:<@${ownSlackUserId}>`;
    const slack = scriptedSlack({
      // Slack's search matches carry no thread_ts: a reply names its thread only in its permalink.
      '/search.messages': searchAnswering(ownMessagesQuery, [
        {
          channel: { id: 'C0002' },
          ts: '1762700250.000350',
          permalink: 'https://acme.slack.com/archives/C0002/p1762700250000350?thread_ts=1762700200.000300&cid=C0002',
        },
        {
          channel: { id: 'C0003' },
          ts: '1762700260.000360',
          permalink: 'https://acme.slack.com/archives/C0003/p1762700260000360',
        },
      ]),
      '/conversations.replies': () => ({
        ok: true,
        messages: [
          { user: ownSlackUserId, text: 'I will check with the carrier.', ts: '1762700200.000300' },
          { user: 'U0003', text: 'Carrier confirmed Thursday.', ts: '1762700300.000400' },
        ],
      }),
    });

    const store = await pollWith(slack);

    const repliesRequests = slack.requests.filter((url) => url.pathname === '/conversations.replies');
    expect(repliesRequests.map((url) => [url.searchParams.get('channel'), url.searchParams.get('ts')])).toEqual([
      ['C0002', '1762700200.000300'],
    ]);
    expect(store.listMessages()).toEqual([
      expect.objectContaining({ conversationId: 'C0002', senderUserId: ownSlackUserId, sentByUser: true }),
      expect.objectContaining({ conversationId: 'C0002', senderUserId: 'U0003', text: 'Carrier confirmed Thursday.' }),
    ]);
    expect(store.newestTimestampInThread('C0002', '1762700200.000300')).toBe('1762700300.000400');
  });

  it("reads the replies of a thread once though several of the user's messages in it match the own-message search", async () => {
    const threadPermalink = (ts: string) =>
      `https://example.slack.com/archives/C0001/p${ts.replace('.', '')}?thread_ts=1762700000.000100`;
    const slack = scriptedSlack({
      '/search.messages': searchAnswering(`from:<@${ownSlackUserId}>`, [
        { permalink: threadPermalink('1762700300.000300'), channel: { id: 'C0001' } },
        { permalink: threadPermalink('1762700200.000200'), channel: { id: 'C0001' } },
      ]),
      '/conversations.replies': () => ({ ok: true, messages: [] }),
    });

    await pollWith(slack);

    expect(slack.requests.filter((url) => url.pathname === '/conversations.replies')).toHaveLength(1);
  });

  it("asks conversations.replies on a second poll only for replies newer than the thread's newest stored one", async () => {
    const slack = scriptedSlack({
      '/search.messages': searchAnswering(`from:<@${ownSlackUserId}>`, [
        {
          channel: { id: 'C0002' },
          ts: '1762700250.000350',
          permalink: 'https://acme.slack.com/archives/C0002/p1762700250000350?thread_ts=1762700200.000300&cid=C0002',
        },
      ]),
      '/conversations.replies': () => ({
        ok: true,
        messages: [{ user: 'U0003', text: 'Carrier confirmed Thursday.', ts: '1762700300.000400' }],
      }),
    });
    const store = await pollWith(slack);
    slack.requests.length = 0;

    await pollWith(slack, store);

    const repliesRequests = slack.requests.filter((url) => url.pathname === '/conversations.replies');
    expect(repliesRequests.map((url) => url.searchParams.get('oldest'))).toEqual(['1762700300.000400']);
  });

  it('waits as long as Retry-After says when Slack answers 429, then retries and stores the message', async () => {
    let historyCalls = 0;
    const waits: number[] = [];
    const slack = scriptedSlack({
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => {
        historyCalls += 1;
        return historyCalls === 1
          ? new Response(null, { status: 429, headers: { 'Retry-After': '3' } })
          : { ok: true, messages: [{ user: 'U0001', text: 'Still there?', ts: '1762700000.000100' }] };
      },
    });
    const store = openSlackMessageStore(':memory:');

    await pollSlackWorkspace({
      fetch: slack.fetch,
      apiUrl: 'https://slack.test',
      clock: pollClock,
      workspace,
      store,
      wait: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
    });

    expect(waits).toEqual([3000]);
    expect(store.listMessages().map((message) => message.text)).toEqual(['Still there?']);
  });

  it('fails the poll, naming the workspace, when Slack answers invalid_auth', async () => {
    const slack = scriptedSlack({ '/auth.test': () => ({ ok: false, error: 'invalid_auth' }) });

    await expect(pollWith(slack)).rejects.toThrow('Slack workspace T0001 answered invalid_auth');
  });

  it('fails the poll, naming the error, when a search answers missing_scope', async () => {
    const slack = scriptedSlack({ '/search.messages': () => ({ ok: false, error: 'missing_scope' }) });

    await expect(pollWith(slack)).rejects.toThrow('missing_scope');
  });
});

describe('pollSlackWorkspaces', () => {
  it('polls every workspace, skips one whose token Slack rejects, and names the workspaces that succeeded', async () => {
    const slack = scriptedSlack({
      '/auth.test': () => ({ ok: true, user_id: ownSlackUserId }),
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [{ user: 'U0001', text: 'Hi', ts: '1762700000.000100' }],
      }),
    });
    const rejectingTokenFetch: typeof fetch = (request, init) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer xoxp-revoked'
        ? Promise.resolve(Response.json({ ok: false, error: 'invalid_auth' }))
        : slack.fetch(request, init);
    const store = openSlackMessageStore(':memory:');

    const succeeded = await pollSlackWorkspaces({
      fetch: rejectingTokenFetch,
      apiUrl: 'https://slack.test',
      clock: pollClock,
      workspaces: [
        { teamId: 'T0001', userToken: 'xoxp-revoked' },
        { teamId: 'T0002', userToken: 'xoxp-test' },
      ],
      store,
    });

    expect([...succeeded]).toEqual(['T0002']);
    expect(store.listMessages().map((message) => message.workspaceTeamId)).toEqual(['T0002']);
  });

  it("logs a failed workspace's team id and the error", async () => {
    const slack = scriptedSlack({ '/auth.test': () => ({ ok: false, error: 'invalid_auth' }) });
    const loggedFailures: { teamId: string; error: unknown }[] = [];

    await pollSlackWorkspaces({
      fetch: slack.fetch,
      apiUrl: 'https://slack.test',
      clock: pollClock,
      workspaces: [{ teamId: 'T0001', userToken: 'xoxp-revoked' }],
      store: openSlackMessageStore(':memory:'),
      logPollFailure: (teamId, error) => loggedFailures.push({ teamId, error }),
    });

    expect(loggedFailures).toEqual([
      { teamId: 'T0001', error: new Error('Slack workspace T0001 answered invalid_auth') },
    ]);
  });

  it('logs no failure when every workspace polls successfully', async () => {
    const slack = scriptedSlack({
      '/auth.test': () => ({ ok: true, user_id: ownSlackUserId }),
      '/search.messages': directMessageSearchNaming('D0001'),
      '/conversations.history': () => ({
        ok: true,
        messages: [{ user: 'U0001', text: 'Hi', ts: '1762700000.000100' }],
      }),
    });
    const loggedFailures: { teamId: string; error: unknown }[] = [];

    const succeeded = await pollSlackWorkspaces({
      fetch: slack.fetch,
      apiUrl: 'https://slack.test',
      clock: pollClock,
      workspaces: [{ teamId: 'T0001', userToken: 'xoxp-test' }],
      store: openSlackMessageStore(':memory:'),
      logPollFailure: (teamId, error) => loggedFailures.push({ teamId, error }),
    });

    expect([...succeeded]).toEqual(['T0001']);
    expect(loggedFailures).toEqual([]);
  });
});
