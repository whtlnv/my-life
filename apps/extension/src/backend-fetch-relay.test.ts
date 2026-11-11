import { describe, expect, it } from 'vitest';

import { answerBackendFetch } from './backend-fetch-relay';

describe('answerBackendFetch', () => {
  it('fetches the message path from the backend with its method and body, and answers with the status and the JSON body', async () => {
    const requests: { url: string; method: string | undefined; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      requests.push({ url, method: init?.method, body: init?.body });
      if (url === 'http://127.0.0.1:7777/chat-messages') {
        return Promise.resolve(Response.json({ stored: 2 }, { status: 201 }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    const answer = await answerBackendFetch(
      { fetch: fakeFetch, backendUrl: 'http://127.0.0.1:7777' },
      { type: 'backend-fetch', path: '/chat-messages', method: 'POST', body: '{"channel":"whatsapp"}' },
    );

    expect(requests).toEqual([
      { url: 'http://127.0.0.1:7777/chat-messages', method: 'POST', body: '{"channel":"whatsapp"}' },
    ]);
    expect(answer).toEqual({ status: 201, body: { stored: 2 } });
  });
});
