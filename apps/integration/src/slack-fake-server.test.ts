import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createApp } from '@my-life/backend/app';
import { openSlackMessageStore } from '@my-life/backend/slack-message-store';
import { pollSlackWorkspace, pollSlackWorkspaces } from '@my-life/backend/slack-poll';

import {
  directMessageText,
  mentionMessageText,
  postedMessageTimestamp,
  startSlackFakeServer,
  ownSlackUserId,
  threadReplyText,
} from './slack-fake-server';

describe('Slack fake server', () => {
  it('in the direct-message scenario lists one DM conversation and returns its message from conversations.history', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const list = (await (
        await fetch(`${slack.url}/conversations.list?types=im`, { headers: { Authorization: 'Bearer xoxp-fake' } })
      ).json()) as { ok: boolean; channels: { id: string; is_im: boolean }[] };

      expect(list.ok).toBe(true);
      expect(list.channels).toHaveLength(1);
      const [conversation] = list.channels;
      expect(conversation?.is_im).toBe(true);

      const history = (await (
        await fetch(`${slack.url}/conversations.history?channel=${conversation?.id ?? ''}`, {
          headers: { Authorization: 'Bearer xoxp-fake' },
        })
      ).json()) as { ok: boolean; messages: { text: string; user: string; ts: string }[] };

      expect(history.ok).toBe(true);
      expect(history.messages).toHaveLength(1);
      expect(history.messages[0]?.text).toBe(directMessageText);
    } finally {
      await slack.close();
    }
  });

  it('in the direct-message scenario lists no DM conversation from conversations.list without types, as Slack lists only public channels by default', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const list = (await (
        await fetch(`${slack.url}/conversations.list`, { headers: { Authorization: `Bearer ${slack.token}` } })
      ).json()) as { ok: boolean; channels: { id: string; is_im: boolean }[] };

      expect(list.ok).toBe(true);
      expect(list.channels.filter((conversation) => conversation.is_im)).toEqual([]);
    } finally {
      await slack.close();
    }
  });

  it('in the mention scenario returns one channel message that mentions the user from search.messages', async () => {
    const slack = await startSlackFakeServer('mention');
    try {
      const search = (await (
        await fetch(`${slack.url}/search.messages?query=${encodeURIComponent(`<@${ownSlackUserId}>`)}`, {
          headers: { Authorization: 'Bearer xoxp-fake' },
        })
      ).json()) as {
        ok: boolean;
        messages: { matches: { text: string; user: string; ts: string; channel: { id: string; is_im: boolean } }[] };
      };

      expect(search.ok).toBe(true);
      expect(search.messages.matches).toHaveLength(1);
      const [match] = search.messages.matches;
      expect(match?.channel.is_im).toBe(false);
      expect(match?.text).toBe(mentionMessageText);
      expect(match?.text).toContain(`<@${ownSlackUserId}>`);
    } finally {
      await slack.close();
    }
  });

  it('in the thread-reply scenario returns a new reply in a thread the user wrote in from conversations.replies', async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const replies = (await (
        await fetch(`${slack.url}/conversations.replies?channel=C0002&ts=1762700200.000300`, {
          headers: { Authorization: 'Bearer xoxp-fake' },
        })
      ).json()) as { ok: boolean; messages: { text: string; user: string; ts: string; thread_ts: string }[] };

      expect(replies.ok).toBe(true);
      expect(replies.messages).toHaveLength(2);
      const [parent, reply] = replies.messages;
      expect(parent?.user).toBe(ownSlackUserId);
      expect(reply?.user).not.toBe(ownSlackUserId);
      expect(reply?.thread_ts).toBe(parent?.ts);
      expect(reply?.text).toBe(threadReplyText);
    } finally {
      await slack.close();
    }
  });

  it('in the thread-reply scenario returns the message the user wrote, with its channel and thread, from search.messages for from:<@U0000>', async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const search = (await (
        await fetch(`${slack.url}/search.messages?query=${encodeURIComponent(`from:<@${ownSlackUserId}>`)}`, {
          headers: { Authorization: `Bearer ${slack.token}` },
        })
      ).json()) as {
        ok: boolean;
        messages: { matches: { user: string; ts: string; thread_ts: string; channel: { id: string } }[] };
      };

      expect(search.ok).toBe(true);
      expect(search.messages.matches).toHaveLength(1);
      const [match] = search.messages.matches;
      expect(match?.user).toBe(ownSlackUserId);
      expect(match?.channel.id).toBe('C0002');
      expect(match?.thread_ts).toBe('1762700200.000300');
    } finally {
      await slack.close();
    }
  });

  it('in the mention scenario returns no matches from search.messages for from:<@U0000>, while any other query still returns the mention', async () => {
    const slack = await startSlackFakeServer('mention');
    try {
      const search = async (query: string) =>
        (await (
          await fetch(`${slack.url}/search.messages?query=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${slack.token}` },
          })
        ).json()) as { ok: boolean; messages: { matches: { text: string }[] } };

      const ownMessages = await search(`from:<@${ownSlackUserId}>`);
      const mentions = await search(`<@${ownSlackUserId}>`);

      expect(ownMessages.ok).toBe(true);
      expect(ownMessages.messages.matches).toEqual([]);
      expect(mentions.messages.matches.map((match) => match.text)).toEqual([mentionMessageText]);
    } finally {
      await slack.close();
    }
  });

  it('answers users.info with the display name of each user in the scenario', async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const displayNames: string[] = [];
      for (const userId of [ownSlackUserId, 'U0003']) {
        const info = (await (
          await fetch(`${slack.url}/users.info?user=${userId}`, { headers: { Authorization: 'Bearer xoxp-fake' } })
        ).json()) as { ok: boolean; user: { id: string; profile: { display_name: string } } };

        expect(info.ok).toBe(true);
        expect(info.user.id).toBe(userId);
        expect(info.user.profile.display_name).not.toBe('');
        displayNames.push(info.user.profile.display_name);
      }
      expect(new Set(displayNames).size).toBe(2);
    } finally {
      await slack.close();
    }
  });

  it("answers auth.test with the scenario's own Slack user id", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const identity = (await (
        await fetch(`${slack.url}/auth.test`, { headers: { Authorization: `Bearer ${slack.token}` } })
      ).json()) as { ok: boolean; user_id: string };

      expect(identity.ok).toBe(true);
      expect(identity.user_id).toBe(ownSlackUserId);
    } finally {
      await slack.close();
    }
  });

  it('started with a chosen own Slack user id answers auth.test with that id', async () => {
    const chosenSlackUserId = 'U0999';
    const slack = await startSlackFakeServer('direct-message', { ownSlackUserId: chosenSlackUserId });
    try {
      const identity = (await (
        await fetch(`${slack.url}/auth.test`, { headers: { Authorization: `Bearer ${slack.token}` } })
      ).json()) as { ok: boolean; user_id: string };

      expect(identity.ok).toBe(true);
      expect(identity.user_id).toBe(chosenSlackUserId);
    } finally {
      await slack.close();
    }
  });

  it("answers a request carrying the scenario's token", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      expect(slack.token).toMatch(/^xoxp-/);
      const list = (await (
        await fetch(`${slack.url}/conversations.list?types=im`, { headers: { Authorization: `Bearer ${slack.token}` } })
      ).json()) as { ok: boolean };

      expect(list.ok).toBe(true);
    } finally {
      await slack.close();
    }
  });

  it('answers invalid_auth to a request carrying any other token', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const list = (await (
        await fetch(`${slack.url}/conversations.list?types=im`, { headers: { Authorization: 'Bearer xoxp-wrong' } })
      ).json()) as { ok: boolean; error?: string };

      expect(list).toEqual({ ok: false, error: 'invalid_auth' });
    } finally {
      await slack.close();
    }
  });

  it('in the rate-limited scenario answers the first request with 429 and a Retry-After header, and the next one normally', async () => {
    const slack = await startSlackFakeServer('rate-limited');
    try {
      const headers = { Authorization: `Bearer ${slack.token}` };
      const first = await fetch(`${slack.url}/users.info?user=${ownSlackUserId}`, { headers });

      expect(first.status).toBe(429);
      expect(Number(first.headers.get('Retry-After'))).toBeGreaterThan(0);

      const second = await fetch(`${slack.url}/users.info?user=${ownSlackUserId}`, { headers });

      expect(second.status).toBe(200);
      expect(((await second.json()) as { ok: boolean }).ok).toBe(true);
    } finally {
      await slack.close();
    }
  });

  it('records a message posted to chat.postMessage with its channel, thread and text', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const posted = (await (
        await fetch(`${slack.url}/chat.postMessage`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${slack.token}`, 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ channel: 'C0002', thread_ts: '1762700200.000300', text: 'On it, numbers tonight.' }),
        })
      ).json()) as { ok: boolean };

      expect(posted.ok).toBe(true);
      expect(slack.postedMessages()).toEqual([
        { channel: 'C0002', threadTimestamp: '1762700200.000300', text: 'On it, numbers tonight.' },
      ]);
    } finally {
      await slack.close();
    }
  });

  it('records each search.messages query so the test can read them back', async () => {
    const slack = await startSlackFakeServer('mention');
    try {
      const headers = { Authorization: `Bearer ${slack.token}` };
      for (const query of [`<@${ownSlackUserId}>`, `from:<@${ownSlackUserId}>`]) {
        await fetch(`${slack.url}/search.messages?query=${encodeURIComponent(query)}`, { headers });
      }

      expect(slack.searchQueries()).toEqual([`<@${ownSlackUserId}>`, `from:<@${ownSlackUserId}>`]);
    } finally {
      await slack.close();
    }
  });

  it('polling the direct-message scenario stores its DM message with its workspace, conversation, sender, text and timestamp', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const store = openSlackMessageStore(':memory:');

      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      expect(store.listMessages()).toEqual([
        expect.objectContaining({
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U0001',
          text: directMessageText,
          timestamp: '1762700000.000100',
        }),
      ]);
    } finally {
      await slack.close();
    }
  });

  it('a second poll of the direct-message scenario stores no DM message the first poll already stored', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const store = openSlackMessageStore(':memory:');
      const poll = () =>
        pollSlackWorkspace({
          fetch,
          apiUrl: slack.url,
          workspace: { teamId: 'T0001', userToken: slack.token },
          store,
        });

      await poll();
      await poll();

      expect(store.listMessages().map((message) => message.timestamp)).toEqual(['1762700000.000100']);
    } finally {
      await slack.close();
    }
  });
  it('polling the mention scenario stores the channel message that mentions the user', async () => {
    const slack = await startSlackFakeServer('mention');
    try {
      const store = openSlackMessageStore(':memory:');

      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      expect(store.listMessages()).toEqual([
        expect.objectContaining({
          workspaceTeamId: 'T0001',
          conversationId: 'C0001',
          senderUserId: 'U0002',
          text: mentionMessageText,
          timestamp: '1762700100.000200',
        }),
      ]);
    } finally {
      await slack.close();
    }
  });
  it("a poll searches Slack for the messages written by the user id that the workspace's auth.test names", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store: openSlackMessageStore(':memory:'),
      });

      expect(slack.searchQueries()).toContain(`from:<@${ownSlackUserId}>`);
    } finally {
      await slack.close();
    }
  });
  it('when the Slack fake is started with another own Slack user id, the poll searches for the messages written by that id', async () => {
    const chosenSlackUserId = 'U0999';
    const slack = await startSlackFakeServer('direct-message', { ownSlackUserId: chosenSlackUserId });
    try {
      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store: openSlackMessageStore(':memory:'),
      });

      expect(slack.searchQueries()).toContain(`from:<@${chosenSlackUserId}>`);
    } finally {
      await slack.close();
    }
  });
  it("a poll stores a reply by someone else in a thread the user wrote in, with the thread's channel and the reply's sender, text and timestamp", async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const store = openSlackMessageStore(':memory:');

      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      expect(store.listMessages()).toContainEqual(
        expect.objectContaining({
          workspaceTeamId: 'T0001',
          conversationId: 'C0002',
          senderUserId: 'U0003',
          text: threadReplyText,
          timestamp: '1762700300.000400',
        }),
      );
    } finally {
      await slack.close();
    }
  });
  it('a second poll of the same workspace asks Slack only for the thread replies newer than the first poll', async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const store = openSlackMessageStore(':memory:');
      const repliesRequests: URL[] = [];
      const recordingFetch: typeof fetch = (request, init) => {
        const url = new URL(request instanceof Request ? request.url : request.toString());
        if (url.pathname === '/conversations.replies') repliesRequests.push(url);
        return fetch(request, init);
      };
      const poll = () =>
        pollSlackWorkspace({
          fetch: recordingFetch,
          apiUrl: slack.url,
          workspace: { teamId: 'T0001', userToken: slack.token },
          store,
        });

      await poll();
      repliesRequests.length = 0;
      await poll();

      expect(repliesRequests.map((url) => url.searchParams.get('oldest'))).toEqual(['1762700300.000400']);
    } finally {
      await slack.close();
    }
  });
  it('a second poll asks conversations.history only for the DM messages newer than the newest one stored for that conversation', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const store = openSlackMessageStore(':memory:');
      const historyRequests: URL[] = [];
      const recordingFetch: typeof fetch = (request, init) => {
        const url = new URL(request instanceof Request ? request.url : request.toString());
        if (url.pathname === '/conversations.history') historyRequests.push(url);
        return fetch(request, init);
      };
      const poll = () =>
        pollSlackWorkspace({
          fetch: recordingFetch,
          apiUrl: slack.url,
          workspace: { teamId: 'T0001', userToken: slack.token },
          store,
        });

      await poll();
      historyRequests.length = 0;
      await poll();

      expect(historyRequests.map((url) => url.searchParams.get('oldest'))).toEqual(['1762700000.000100']);
    } finally {
      await slack.close();
    }
  });
  it('a poll does not store a reply in a thread the user never wrote in', async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const store = openSlackMessageStore(':memory:');
      const ownTopLevelMessageOutsideAnyThread = {
        ok: true,
        messages: {
          matches: [
            {
              text: 'Morning all.',
              user: ownSlackUserId,
              ts: '1762700500.000600',
              channel: { id: 'C0002', is_im: false },
            },
          ],
        },
      };
      const fetchWhereTheUserWroteOnlyOutsideTheThread: typeof fetch = (request, init) => {
        const url = new URL(request instanceof Request ? request.url : request.toString());
        if (url.pathname === '/search.messages' && (url.searchParams.get('query') ?? '').startsWith('from:')) {
          return Promise.resolve(Response.json(ownTopLevelMessageOutsideAnyThread));
        }
        return fetch(request, init);
      };

      await pollSlackWorkspace({
        fetch: fetchWhereTheUserWroteOnlyOutsideTheThread,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      expect(store.listMessages().map((message) => message.text)).not.toContain(threadReplyText);
    } finally {
      await slack.close();
    }
  });
  it("a poll finds mentions by searching Slack for <@id> with the user id the workspace's auth.test names", async () => {
    const chosenSlackUserId = 'U0999';
    const slack = await startSlackFakeServer('direct-message', { ownSlackUserId: chosenSlackUserId });
    try {
      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store: openSlackMessageStore(':memory:'),
      });

      expect(slack.searchQueries()).toContain(`<@${chosenSlackUserId}>`);
    } finally {
      await slack.close();
    }
  });
  it('a thread reply older than a newer message stored in the same channel outside the thread is still stored', async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const store = openSlackMessageStore(':memory:');
      store.saveMessage({
        workspaceTeamId: 'T0001',
        conversationId: 'C0002',
        senderUserId: 'U0002',
        text: 'Lunch anyone?',
        timestamp: '1762700900.000900',
      });
      const fetchHonoringRepliesOldest: typeof fetch = async (request, init) => {
        const url = new URL(request instanceof Request ? request.url : request.toString());
        const response = await fetch(request, init);
        const oldest = url.searchParams.get('oldest');
        if (url.pathname !== '/conversations.replies' || oldest === null) return response;
        const body = (await response.json()) as { messages: { ts: string }[] };
        return Response.json({ ...body, messages: body.messages.filter((message) => message.ts > oldest) });
      };

      await pollSlackWorkspace({
        fetch: fetchHonoringRepliesOldest,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      expect(store.listMessages().map((message) => message.text)).toContain(threadReplyText);
    } finally {
      await slack.close();
    }
  });
  it('a DM message the user sent is stored as sent by the user', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const store = openSlackMessageStore(':memory:');
      const ownDirectMessage = {
        type: 'message',
        user: ownSlackUserId,
        text: 'Yes, by noon.',
        ts: '1762700100.000200',
      };
      const fetchWithTheUsersOwnDirectMessage: typeof fetch = async (request, init) => {
        const url = new URL(request instanceof Request ? request.url : request.toString());
        const response = await fetch(request, init);
        if (url.pathname !== '/conversations.history') return response;
        const body = (await response.json()) as { messages: unknown[] };
        return Response.json({ ...body, messages: [ownDirectMessage, ...body.messages] });
      };

      await pollSlackWorkspace({
        fetch: fetchWithTheUsersOwnDirectMessage,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      const storedOwnMessage = store.listMessages().find((message) => message.timestamp === ownDirectMessage.ts);
      expect(storedOwnMessage).toMatchObject({ senderUserId: ownSlackUserId, sentByUser: true });
    } finally {
      await slack.close();
    }
  });

  it('a thread reply the user posted, polled from conversations.replies, keeps the reply it answers out of GET /waiting-on', async () => {
    const slack = await startSlackFakeServer('thread-reply');
    const databaseDirectory = mkdtempSync(join(tmpdir(), 'my-life-'));
    try {
      const databasePath = join(databaseDirectory, 'my-life.sqlite');
      const ownThreadReply = {
        type: 'message',
        user: ownSlackUserId,
        text: 'Thanks, tonight works.',
        ts: '1762700400.000500',
        thread_ts: '1762700200.000300',
      };
      const fetchWithTheUsersOwnThreadReply: typeof fetch = async (request, init) => {
        const url = new URL(request instanceof Request ? request.url : request.toString());
        const response = await fetch(request, init);
        if (url.pathname !== '/conversations.replies') return response;
        const body = (await response.json()) as { messages: unknown[] };
        return Response.json({ ...body, messages: [...body.messages, ownThreadReply] });
      };

      await pollSlackWorkspace({
        fetch: fetchWithTheUsersOwnThreadReply,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store: openSlackMessageStore(databasePath),
      });
      const backend = createApp({ allowedEmails: [], databasePath });
      const { people } = (await (await backend.request('/waiting-on')).json()) as { people: unknown[] };

      expect(people).toEqual([]);
    } finally {
      await slack.close();
      rmSync(databaseDirectory, { recursive: true, force: true });
    }
  });

  it("a stored Slack message carries its sender's Slack display name", async () => {
    const slack = await startSlackFakeServer('thread-reply');
    try {
      const store = openSlackMessageStore(':memory:');
      const replySenderInfo = (await (
        await fetch(`${slack.url}/users.info?user=U0003`, { headers: { Authorization: `Bearer ${slack.token}` } })
      ).json()) as { user: { profile: { display_name: string } } };

      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      const storedReply = store.listMessages().find((message) => message.text === threadReplyText);
      expect(storedReply).toMatchObject({
        senderUserId: 'U0003',
        senderName: replySenderInfo.user.profile.display_name,
      });
    } finally {
      await slack.close();
    }
  });

  it("a stored Slack message whose sender users.info cannot resolve carries the sender's user id as its name", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const store = openSlackMessageStore(':memory:');

      await pollSlackWorkspace({
        fetch,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
      });

      const storedMessage = store.listMessages().find((message) => message.text === directMessageText);
      expect(storedMessage).toMatchObject({ senderUserId: 'U0001', senderName: 'U0001' });
    } finally {
      await slack.close();
    }
  });

  it('when Slack answers 429 with Retry-After, the poll waits that long and retries, and the message is stored', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const store = openSlackMessageStore(':memory:');
      let historyRateLimitPending = true;
      const fetchRateLimitingTheFirstHistoryRequest: typeof fetch = async (request, init) => {
        const url = new URL(request instanceof Request ? request.url : request.toString());
        if (url.pathname === '/conversations.history' && historyRateLimitPending) {
          historyRateLimitPending = false;
          return new Response(null, { status: 429, headers: { 'Retry-After': '2' } });
        }
        return fetch(request, init);
      };
      const waitedMilliseconds: number[] = [];

      await pollSlackWorkspace({
        fetch: fetchRateLimitingTheFirstHistoryRequest,
        apiUrl: slack.url,
        workspace: { teamId: 'T0001', userToken: slack.token },
        store,
        wait: async (milliseconds: number) => {
          waitedMilliseconds.push(milliseconds);
        },
      });

      expect(waitedMilliseconds).toEqual([2000]);
      expect(store.listMessages().map((message) => message.text)).toContain(directMessageText);
    } finally {
      await slack.close();
    }
  });

  it("when one workspace answers invalid_auth, the poll does not retry it, and the other workspace's messages are still stored", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const store = openSlackMessageStore(':memory:');
      const revokedToken = 'xoxp-revoked';
      let requestsWithTheRevokedToken = 0;
      const fetchCountingRevokedTokenRequests: typeof fetch = async (request, init) => {
        if (new Headers(init?.headers).get('Authorization') === `Bearer ${revokedToken}`) {
          requestsWithTheRevokedToken += 1;
        }
        return fetch(request, init);
      };

      await pollSlackWorkspaces({
        fetch: fetchCountingRevokedTokenRequests,
        apiUrl: slack.url,
        workspaces: [
          { teamId: 'T0002', userToken: revokedToken },
          { teamId: 'T0001', userToken: slack.token },
        ],
        store,
        wait: async () => {},
      });

      expect(requestsWithTheRevokedToken).toBe(1);
      expect(store.listMessages()).toEqual([
        expect.objectContaining({ workspaceTeamId: 'T0001', text: directMessageText }),
      ]);
    } finally {
      await slack.close();
    }
  });
  it("POST /slack-poll on a backend whose Slack API URL points at the fake stores the direct-message scenario's DM, which GET /slack-messages then serves", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-poll', { method: 'POST' });
      const { messages } = (await (await backend.request('/slack-messages')).json()) as {
        messages: { workspaceTeamId: string; text: string }[];
      };

      expect(messages).toEqual([expect.objectContaining({ workspaceTeamId: 'T0001', text: directMessageText })]);
    } finally {
      await slack.close();
    }
  });
  it('after a successful POST /slack-poll, GET /now lists each configured Slack workspace with the time of its last successful poll', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const pollTime = new Date('2026-11-09T16:00:00.000Z');
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => pollTime },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-poll', { method: 'POST' });
      const now = (await (await backend.request('/now')).json()) as { slackWorkspaces?: unknown };

      expect(now.slackWorkspaces).toEqual([{ teamId: 'T0001', lastSuccessfulPollAt: '2026-11-09T16:00:00.000Z' }]);
    } finally {
      await slack.close();
    }
  });
  it('after a POST /slack-poll in which a workspace answers invalid_auth, GET /now gives that workspace no last successful poll time, while the other workspace has one', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const pollTime = new Date('2026-11-09T16:00:00.000Z');
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => pollTime },
        slackApiUrl: slack.url,
        slackWorkspaces: [
          { teamId: 'T0002', userToken: 'xoxp-revoked' },
          { teamId: 'T0001', userToken: slack.token },
        ],
      });

      await backend.request('/slack-poll', { method: 'POST' });
      const now = (await (await backend.request('/now')).json()) as { slackWorkspaces?: unknown };

      expect(now.slackWorkspaces).toEqual([
        { teamId: 'T0002' },
        { teamId: 'T0001', lastSuccessfulPollAt: '2026-11-09T16:00:00.000Z' },
      ]);
    } finally {
      await slack.close();
    }
  });
  it('GET /now marks a Slack workspace stale when its last successful poll is older than twice its polling interval', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      let currentTime = new Date('2026-11-09T16:00:00.000Z');
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => currentTime },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
        slackPollingIntervalInMilliseconds: 60_000,
      });

      await backend.request('/slack-poll', { method: 'POST' });
      currentTime = new Date('2026-11-09T16:02:01.000Z');
      const now = (await (await backend.request('/now')).json()) as { slackWorkspaces?: unknown };

      expect(now.slackWorkspaces).toEqual([
        { teamId: 'T0001', lastSuccessfulPollAt: '2026-11-09T16:00:00.000Z', stale: true },
      ]);
    } finally {
      await slack.close();
    }
  });
  it('after a POST /slack-poll, GET /now lists each Slack workspace with the name its auth.test gives as team', async () => {
    const slack = await startSlackFakeServer('direct-message', { workspaceName: 'Acme Studio' });
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-poll', { method: 'POST' });
      const now = (await (await backend.request('/now')).json()) as { slackWorkspaces?: unknown };

      expect(now.slackWorkspaces).toEqual([expect.objectContaining({ teamId: 'T0001', name: 'Acme Studio' })]);
    } finally {
      await slack.close();
    }
  });

  it('after a POST /slack-poll, a Slack triage item carries the workspace name its auth.test gives as team', async () => {
    const slack = await startSlackFakeServer('direct-message', { workspaceName: 'Acme Studio' });
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-poll', { method: 'POST' });
      const { slackItems } = (await (await backend.request('/triage-queue')).json()) as {
        slackItems: { workspaceName?: string }[];
      };

      expect(slackItems.map((item) => item.workspaceName)).toEqual(['Acme Studio']);
    } finally {
      await slack.close();
    }
  });

  it("after a POST /slack-poll, the task that confirming act on a Slack item creates links to the message's permalink under the workspace URL its auth.test gives", async () => {
    const slack = await startSlackFakeServer('direct-message', { workspaceUrl: 'https://acme-studio.slack.com/' });
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });
      await backend.request('/slack-poll', { method: 'POST' });

      await backend.request('/slack-verdicts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          timestamp: '1762700000.000100',
          decision: 'act',
        }),
      });
      const { tasks } = (await (await backend.request('/tasks')).json()) as { tasks: { link: string }[] };

      expect(tasks.map((task) => task.link)).toEqual(['https://acme-studio.slack.com/archives/D0001/p1762700000000100']);
    } finally {
      await slack.close();
    }
  });

  it("after a POST /slack-poll, a Slack contact's timeline links each message to its permalink under the workspace URL its auth.test gives", async () => {
    const slack = await startSlackFakeServer('direct-message', { workspaceUrl: 'https://acme-studio.slack.com/' });
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });
      await backend.request('/slack-poll', { method: 'POST' });

      const { messages } = (await (await backend.request('/slack-contacts/T0001/U0001/timeline')).json()) as {
        messages: { permalink: string }[];
      };

      expect(messages.map((message) => message.permalink)).toEqual([
        'https://acme-studio.slack.com/archives/D0001/p1762700000000100',
      ]);
    } finally {
      await slack.close();
    }
  });

  it('after a POST /slack-poll, a Slack triage item links to the workspace URL its auth.test gives followed by archives/<conversation>/p<timestamp without the dot>', async () => {
    const slack = await startSlackFakeServer('direct-message', { workspaceUrl: 'https://acme-studio.slack.com/' });
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-poll', { method: 'POST' });
      const { slackItems } = (await (await backend.request('/triage-queue')).json()) as {
        slackItems: { permalink: string }[];
      };

      expect(slackItems.map((item) => item.permalink)).toEqual([
        'https://acme-studio.slack.com/archives/D0001/p1762700000000100',
      ]);
    } finally {
      await slack.close();
    }
  });

  it('after a POST /slack-poll, GET /people gives a Slack contact the workspace name its auth.test gives as its organization, and the time of its last Slack message', async () => {
    const slack = await startSlackFakeServer('direct-message', { workspaceName: 'Acme Studio' });
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-poll', { method: 'POST' });
      const { everyoneElse } = (await (await backend.request('/people')).json()) as { everyoneElse: unknown[] };

      expect(everyoneElse).toEqual([
        expect.objectContaining({
          channel: 'slack',
          organization: 'Acme Studio',
          lastMessageAt: '2025-11-09T14:53:20.000Z',
        }),
      ]);
    } finally {
      await slack.close();
    }
  });

  it('confirming reply at POST /slack-verdicts on a polled Slack DM posts nothing to Slack', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });
      await backend.request('/slack-poll', { method: 'POST' });
      const { slackItems } = (await (await backend.request('/triage-queue')).json()) as {
        slackItems: { workspaceTeamId: string; conversationId: string; timestamp: string }[];
      };
      const [item] = slackItems;

      const response = await backend.request('/slack-verdicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceTeamId: item?.workspaceTeamId,
          conversationId: item?.conversationId,
          timestamp: item?.timestamp,
          decision: 'reply',
        }),
      });

      expect(slackItems).toHaveLength(1);
      expect(response.status).toBe(200);
      expect(slack.postedMessages()).toEqual([]);
    } finally {
      await slack.close();
    }
  });

  it("an explicit send at POST /slack-sends with a workspace, conversation and text posts the text to chat.postMessage with the user's token and records the send at GET /slack-sends", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      const response = await backend.request('/slack-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceTeamId: 'T0001', conversationId: 'D0001', text: 'On it, sending it tonight.' }),
      });

      expect(response.status).toBe(200);
      expect(slack.postedMessages()).toEqual([
        { channel: 'D0001', threadTimestamp: undefined, text: 'On it, sending it tonight.' },
      ]);
      const { sends } = (await (await backend.request('/slack-sends')).json()) as { sends: unknown[] };
      expect(sends).toEqual([
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          text: 'On it, sending it tonight.',
          sentAt: '2026-11-09T16:00:00.000Z',
        },
      ]);
    } finally {
      await slack.close();
    }
  });

  it('an explicit send at POST /slack-sends that names a thread timestamp posts the reply into that thread', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceTeamId: 'T0001',
          conversationId: 'C0001',
          threadTimestamp: '1762700200.000300',
          text: 'Agreed, let us ship Friday.',
        }),
      });

      expect(slack.postedMessages()).toEqual([
        { channel: 'C0001', threadTimestamp: '1762700200.000300', text: 'Agreed, let us ship Friday.' },
      ]);
    } finally {
      await slack.close();
    }
  });

  it('a send Slack rejects at POST /slack-sends returns the Slack error to the dashboard and records no send', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: 'xoxp-revoked-token' }],
      });

      const response = await backend.request('/slack-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceTeamId: 'T0001', conversationId: 'D0001', text: 'On it, sending it tonight.' }),
      });

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'invalid_auth' });
      const { sends } = (await (await backend.request('/slack-sends')).json()) as { sends: unknown[] };
      expect(sends).toEqual([]);
    } finally {
      await slack.close();
    }
  });

  it('after a reply is sent at POST /slack-sends, the person it answers no longer appears in GET /waiting-on for that conversation', async () => {
    const slack = await startSlackFakeServer('direct-message');
    const databaseDirectory = mkdtempSync(join(tmpdir(), 'my-life-'));
    try {
      const databasePath = join(databaseDirectory, 'my-life.sqlite');
      openSlackMessageStore(databasePath).saveMessage({
        workspaceTeamId: 'T0001',
        conversationId: 'D0001',
        senderUserId: 'U0001',
        senderName: 'Ana',
        text: 'Can you look at the contract today?',
        timestamp: '1762700000.000100',
      });
      const backend = createApp({
        allowedEmails: [],
        databasePath,
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceTeamId: 'T0001', conversationId: 'D0001', text: 'On it, sending it tonight.' }),
      });
      const { people } = (await (await backend.request('/waiting-on')).json()) as { people: unknown[] };

      expect(people).toEqual([]);
    } finally {
      await slack.close();
      rmSync(databaseDirectory, { recursive: true, force: true });
    }
  });

  it("stores a reply sent at POST /slack-sends under the ts and channel chat.postMessage returns, sent by the user's own Slack id", async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      await backend.request('/slack-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceTeamId: 'T0001', conversationId: 'D0001', text: 'On it, sending it tonight.' }),
      });
      const { messages } = (await (await backend.request('/slack-messages')).json()) as { messages: unknown[] };

      expect(messages).toEqual([
        expect.objectContaining({
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: ownSlackUserId,
          text: 'On it, sending it tonight.',
          timestamp: postedMessageTimestamp,
          sentByUser: true,
        }),
      ]);
    } finally {
      await slack.close();
    }
  });

  it('a send with empty text at POST /slack-sends is refused with 400 and posts nothing to Slack', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      const response = await backend.request('/slack-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceTeamId: 'T0001', conversationId: 'D0001', text: '' }),
      });

      expect(response.status).toBe(400);
      expect(slack.postedMessages()).toEqual([]);
    } finally {
      await slack.close();
    }
  });

  it('a send to a workspace with no configured user token at POST /slack-sends is refused with 400 and posts nothing to Slack', async () => {
    const slack = await startSlackFakeServer('direct-message');
    try {
      const backend = createApp({
        allowedEmails: [],
        clock: { now: () => new Date('2026-11-09T16:00:00.000Z') },
        slackApiUrl: slack.url,
        slackWorkspaces: [{ teamId: 'T0001', userToken: slack.token }],
      });

      const response = await backend.request('/slack-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceTeamId: 'T9999', conversationId: 'D0001', text: 'On my way' }),
      });

      expect(response.status).toBe(400);
      expect(slack.postedMessages()).toEqual([]);
    } finally {
      await slack.close();
    }
  });

  it("the shipped backend (main.ts), started with a workspace token and MY_LIFE_SLACK_API_URL pointed at the fake, polls at the configured interval, serves the scenario's DM in GET /triage-queue and posts a send to the fake's chat.postMessage", async () => {
    const slack = await startSlackFakeServer('direct-message');
    const databaseDirectory = mkdtempSync(join(tmpdir(), 'my-life-'));
    const probe = createNetServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((resolve) =>
      probe.close(() => {
        resolve();
      }),
    );
    const baseUrl = `http://127.0.0.1:${String(port)}`;
    const environment = { ...process.env };
    delete environment.ANTHROPIC_API_KEY;
    const backend = spawn('node_modules/.bin/tsx', ['src/main.ts'], {
      cwd: fileURLToPath(new URL('../../backend', import.meta.url)),
      env: {
        ...environment,
        MY_LIFE_PORT: String(port),
        MY_LIFE_DATABASE_PATH: join(databaseDirectory, 'my-life.sqlite'),
        MY_LIFE_ALLOWED_EMAILS: 'ana@example.com',
        MY_LIFE_SLACK_API_URL: slack.url,
        MY_LIFE_SLACK_WORKSPACE_1_TEAM_ID: 'T0001',
        MY_LIFE_SLACK_WORKSPACE_1_USER_TOKEN: slack.token,
        MY_LIFE_SLACK_POLLING_INTERVAL_SECONDS: '1',
      },
      stdio: 'ignore',
    });
    const triageQueue = async () =>
      fetch(`${baseUrl}/triage-queue`).then(
        async (response) => ((await response.json()) as { slackItems: { text: string }[] }).slackItems,
        () => [],
      );
    try {
      for (let attempt = 0; attempt < 100 && slack.searchQueries().length < 4; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const slackItems = await triageQueue();

      const response = await fetch(`${baseUrl}/slack-sends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceTeamId: 'T0001', conversationId: 'D0001', text: 'On it, sending it tonight.' }),
      }).catch(() => undefined);

      expect(slack.searchQueries().length).toBeGreaterThanOrEqual(4);
      expect(slackItems).toEqual([expect.objectContaining({ text: directMessageText })]);
      expect(response?.status).toBe(200);
      expect(slack.postedMessages()).toEqual([
        { channel: 'D0001', threadTimestamp: undefined, text: 'On it, sending it tonight.' },
      ]);
    } finally {
      backend.kill();
      await slack.close();
      rmSync(databaseDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
