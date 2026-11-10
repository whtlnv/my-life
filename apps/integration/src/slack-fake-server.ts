import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

type SlackScenario = 'direct-message' | 'mention' | 'thread-reply' | 'rate-limited';

export const directMessageText = 'Can you review the proposal today?';

export const ownSlackUserId = 'U0000';

export const mentionMessageText = `<@${ownSlackUserId}> can you join the launch call?`;

export const threadReplyText = 'Sounds good, I will send the numbers tonight.';

export const postedMessageTimestamp = '1762704000.000500';

const threadTimestamp = '1762700200.000300';

const threadParentText = 'Can someone share the Q3 numbers?';

const noSearchMatches = { ok: true, messages: { matches: [] } };

const directMessageSearchMatches = {
  ok: true,
  messages: { matches: [{ text: directMessageText, user: 'U0001', channel: { id: 'D0001', is_im: true } }] },
};

const displayNameByUserId: Record<string, string> = { [ownSlackUserId]: 'me', U0003: 'Dana' };

function usersInfoResponse(userId: string) {
  return { ok: true, user: { id: userId, profile: { display_name: displayNameByUserId[userId] } } };
}

const responseByPathByScenario: Record<SlackScenario, Record<string, unknown>> = {
  'direct-message': {
    '/conversations.list': { ok: true, channels: [{ id: 'D0001', is_im: true, user: 'U0001' }] },
    '/conversations.history': {
      ok: true,
      messages: [{ type: 'message', user: 'U0001', text: directMessageText, ts: '1762700000.000100' }],
    },
    '/search.messages': noSearchMatches,
  },
  mention: {
    '/conversations.list': { ok: true, channels: [] },
    '/search.messages': {
      ok: true,
      messages: {
        matches: [
          {
            text: mentionMessageText,
            user: 'U0002',
            ts: '1762700100.000200',
            channel: { id: 'C0001', is_im: false },
          },
        ],
      },
    },
  },
  'thread-reply': {
    '/conversations.list': { ok: true, channels: [] },
    '/search.messages': {
      ok: true,
      messages: {
        matches: [
          // As in real Slack, a search match carries no thread_ts: a reply names its thread only in its permalink.
          {
            text: threadParentText,
            user: ownSlackUserId,
            ts: threadTimestamp,
            permalink: `https://acme.slack.com/archives/C0002/p${threadTimestamp.replace('.', '')}?thread_ts=${threadTimestamp}&cid=C0002`,
            channel: { id: 'C0002', is_im: false },
          },
        ],
      },
    },
    '/conversations.replies': {
      ok: true,
      messages: [
        {
          type: 'message',
          user: ownSlackUserId,
          text: threadParentText,
          ts: threadTimestamp,
          thread_ts: threadTimestamp,
        },
        {
          type: 'message',
          user: 'U0003',
          text: threadReplyText,
          ts: '1762700300.000400',
          thread_ts: threadTimestamp,
        },
      ],
    },
  },
  'rate-limited': {},
};

const token = 'xoxp-fake';

interface PostedMessage {
  channel: string;
  threadTimestamp: string;
  text: string;
}

function respondRateLimited(response: ServerResponse) {
  response.writeHead(429, { 'Retry-After': '1' });
  response.end();
}

function recordPostedMessage(request: IncomingMessage, response: ServerResponse, postedMessages: PostedMessage[]) {
  let body = '';
  request.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });
  request.on('end', () => {
    const message = JSON.parse(body) as { channel: string; thread_ts: string; text: string };
    postedMessages.push({ channel: message.channel, threadTimestamp: message.thread_ts, text: message.text });
    response.end(JSON.stringify({ ok: true, channel: message.channel, ts: postedMessageTimestamp }));
  });
}

function searchResponseForQuery(scenario: SlackScenario, query: string): unknown {
  if (query.includes('is:dm') && !query.includes('after:')) return { ok: false, error: 'invalid_search' };
  if (scenario === 'direct-message' && query.includes('is:dm')) return directMessageSearchMatches;
  if (scenario === 'mention' && query.startsWith('from:')) return noSearchMatches;
  return undefined;
}

export async function startSlackFakeServer(
  scenario: SlackScenario,
  options: { ownSlackUserId?: string; workspaceName?: string; workspaceUrl?: string } = {},
) {
  const responseByPath = responseByPathByScenario[scenario];
  let rateLimitPending = scenario === 'rate-limited';
  const postedMessages: PostedMessage[] = [];
  const searchQueries: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake');
    if (rateLimitPending) {
      rateLimitPending = false;
      respondRateLimited(response);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.end(JSON.stringify({ ok: false, error: 'invalid_auth' }));
      return;
    }
    if (url.pathname === '/chat.postMessage') {
      recordPostedMessage(request, response, postedMessages);
      return;
    }
    if (url.pathname === '/search.messages') {
      const query = url.searchParams.get('query') ?? '';
      searchQueries.push(query);
      const searchResponse = searchResponseForQuery(scenario, query);
      if (searchResponse) {
        response.end(JSON.stringify(searchResponse));
        return;
      }
    }
    if (url.pathname === '/conversations.list' && !url.searchParams.has('types')) {
      response.end(JSON.stringify({ ok: true, channels: [] }));
      return;
    }
    if (url.pathname === '/users.info') {
      response.end(JSON.stringify(usersInfoResponse(url.searchParams.get('user') ?? '')));
      return;
    }
    if (url.pathname === '/auth.test') {
      response.end(
        JSON.stringify({
          ok: true,
          user_id: options.ownSlackUserId ?? ownSlackUserId,
          team: options.workspaceName,
          url: options.workspaceUrl,
        }),
      );
      return;
    }
    response.end(JSON.stringify(responseByPath[url.pathname]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    token,
    postedMessages: () => postedMessages,
    searchQueries: () => searchQueries,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  };
}
