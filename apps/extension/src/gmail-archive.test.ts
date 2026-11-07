import { describe, expect, it } from 'vitest';

import { carryOutArchiveCommands } from './gmail-archive';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';

describe('carryOutArchiveCommands', () => {
  it("removes the message of a pending archive command for the profile's account from the inbox and adds the label my-life/archived", async () => {
    const modifications: { messageId: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (
        url.origin + url.pathname === 'http://127.0.0.1:7777/commands' &&
        url.searchParams.get('accountEmail') === 'francisco@example.com'
      ) {
        return Promise.resolve(
          Response.json({ commands: [{ id: 'command-1', kind: 'archive', messageId: 'message-to-archive' }] }),
        );
      }
      if (url.origin + url.pathname === `${gmailApi}/labels`) {
        return Promise.resolve(
          Response.json({
            labels: [
              { id: 'INBOX', name: 'INBOX', type: 'system' },
              { id: 'Label_42', name: 'my-life/archived', type: 'user' },
            ],
          }),
        );
      }
      const modifyPath = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/modify$/.exec(url.pathname);
      if (url.origin === 'https://gmail.googleapis.com' && modifyPath !== null && init?.method === 'POST') {
        modifications.push({ messageId: modifyPath[1] ?? '', body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ id: modifyPath[1], labelIds: ['Label_42'] }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await carryOutArchiveCommands({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
    });

    expect(modifications).toEqual([
      { messageId: 'message-to-archive', body: { removeLabelIds: ['INBOX'], addLabelIds: ['Label_42'] } },
    ]);
  });
});
