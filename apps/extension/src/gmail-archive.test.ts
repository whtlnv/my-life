import { describe, expect, it } from 'vitest';

import type { FetchFunction } from './fetch-function';
import { carryOutArchiveCommands } from './gmail-archive';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailRequest {
  request: string;
  body: unknown;
}

const inboxLabel = { id: 'INBOX', name: 'INBOX', type: 'system' };
const archivedLabel = { id: 'Label_42', name: 'my-life/archived', type: 'user' };

function fakeBackendAndGmail(
  existingLabels: { id: string; name: string; type: string }[],
  gmailRequests: GmailRequest[],
): FetchFunction {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (
      url.origin + url.pathname === 'http://127.0.0.1:7777/commands' &&
      url.searchParams.get('accountEmail') === 'francisco@example.com'
    ) {
      return Promise.resolve(
        Response.json({ commands: [{ id: 'command-1', kind: 'archive', messageId: 'message-to-archive' }] }),
      );
    }
    if (url.origin + url.pathname === `${gmailApi}/labels` && init?.method === 'POST') {
      gmailRequests.push({ request: 'create label', body: JSON.parse(init.body as string) });
      return Promise.resolve(Response.json({ id: 'Label_99', name: 'my-life/archived', type: 'user' }));
    }
    if (url.origin + url.pathname === `${gmailApi}/labels`) {
      return Promise.resolve(Response.json({ labels: existingLabels }));
    }
    const modifyPath = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/modify$/.exec(url.pathname);
    if (url.origin === 'https://gmail.googleapis.com' && modifyPath !== null && init?.method === 'POST') {
      gmailRequests.push({ request: `modify ${modifyPath[1] ?? ''}`, body: JSON.parse(init.body as string) });
      return Promise.resolve(Response.json({ id: modifyPath[1], labelIds: [] }));
    }
    return Promise.resolve(new Response('unexpected request', { status: 404 }));
  };
}

const runArchive = (fetch: FetchFunction) =>
  carryOutArchiveCommands({
    fetch,
    accessToken: 'token-for-francisco',
    accountEmail: 'francisco@example.com',
    backendUrl: 'http://127.0.0.1:7777',
  });

describe('carryOutArchiveCommands', () => {
  it("removes the message of a pending archive command for the profile's account from the inbox and adds the label my-life/archived", async () => {
    const gmailRequests: GmailRequest[] = [];

    await runArchive(fakeBackendAndGmail([inboxLabel, archivedLabel], gmailRequests));

    expect(gmailRequests).toEqual([
      { request: 'modify message-to-archive', body: { removeLabelIds: ['INBOX'], addLabelIds: ['Label_42'] } },
    ]);
  });

  it('creates the label my-life/archived before the first archive when it does not exist yet', async () => {
    const gmailRequests: GmailRequest[] = [];

    await runArchive(fakeBackendAndGmail([inboxLabel], gmailRequests));

    expect(gmailRequests).toEqual([
      { request: 'create label', body: expect.objectContaining({ name: 'my-life/archived' }) as unknown },
      { request: 'modify message-to-archive', body: { removeLabelIds: ['INBOX'], addLabelIds: ['Label_99'] } },
    ]);
  });

  it('creates no second label my-life/archived when the label already exists', async () => {
    const gmailRequests: GmailRequest[] = [];

    await runArchive(fakeBackendAndGmail([inboxLabel, archivedLabel], gmailRequests));

    expect(gmailRequests.filter(({ request }) => request === 'create label')).toEqual([]);
  });

  it('acknowledges a carried-out archive to the backend so the next poll does not carry it out again', async () => {
    const gmailRequests: GmailRequest[] = [];
    const gmail = fakeBackendAndGmail([inboxLabel, archivedLabel], gmailRequests);
    const acknowledgedCommandIds = new Set<string>();
    const backendWithAcknowledgements: FetchFunction = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === 'http://127.0.0.1:7777/commands') {
        const pending = [{ id: 'command-1', kind: 'archive', messageId: 'message-to-archive' }].filter(
          (command) => !acknowledgedCommandIds.has(command.id),
        );
        return Promise.resolve(Response.json({ commands: pending }));
      }
      const acknowledgementPath = /^\/commands\/([^/]+)\/acknowledgement$/.exec(url.pathname);
      if (url.origin === 'http://127.0.0.1:7777' && acknowledgementPath !== null && init?.method === 'POST') {
        acknowledgedCommandIds.add(acknowledgementPath[1] ?? '');
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return gmail(input, init);
    };

    await runArchive(backendWithAcknowledgements);
    await runArchive(backendWithAcknowledgements);

    expect(gmailRequests.filter(({ request }) => request.startsWith('modify'))).toEqual([
      { request: 'modify message-to-archive', body: { removeLabelIds: ['INBOX'], addLabelIds: ['Label_42'] } },
    ]);
  });
  it('does not acknowledge an archive that Gmail refused and retries it on the next poll', async () => {
    const gmailRequests: GmailRequest[] = [];
    const gmail = fakeBackendAndGmail([inboxLabel, archivedLabel], gmailRequests);
    const events: string[] = [];
    const acknowledgedCommandIds = new Set<string>();
    let gmailRefusesNextModify = true;
    const backendAndFlakyGmail: FetchFunction = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === 'http://127.0.0.1:7777/commands') {
        const pending = [{ id: 'command-1', kind: 'archive', messageId: 'message-to-archive' }].filter(
          (command) => !acknowledgedCommandIds.has(command.id),
        );
        return Promise.resolve(Response.json({ commands: pending }));
      }
      const acknowledgementPath = /^\/commands\/([^/]+)\/acknowledgement$/.exec(url.pathname);
      if (url.origin === 'http://127.0.0.1:7777' && acknowledgementPath !== null && init?.method === 'POST') {
        events.push(`acknowledge ${acknowledgementPath[1] ?? ''}`);
        acknowledgedCommandIds.add(acknowledgementPath[1] ?? '');
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.pathname.endsWith('/modify') && gmailRefusesNextModify) {
        gmailRefusesNextModify = false;
        events.push('modify refused');
        return Promise.resolve(Response.json({ error: { code: 500, message: 'Backend Error' } }, { status: 500 }));
      }
      if (url.pathname.endsWith('/modify')) {
        events.push('modify carried out');
      }
      return gmail(input, init);
    };

    await runArchive(backendAndFlakyGmail);
    await runArchive(backendAndFlakyGmail);

    expect(events).toEqual(['modify refused', 'modify carried out', 'acknowledge command-1']);
  });
});
