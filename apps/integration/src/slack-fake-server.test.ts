import { describe, expect, it } from 'vitest';

import { openSlackMessageStore } from '@my-life/backend/slack-message-store';
import { pollSlackWorkspace } from '@my-life/backend/slack-poll';

import {
  directMessageText,
  mentionMessageText,
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
        {
          workspaceTeamId: 'T0001',
          conversationId: 'D0001',
          senderUserId: 'U0001',
          text: directMessageText,
          timestamp: '1762700000.000100',
        },
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
        {
          workspaceTeamId: 'T0001',
          conversationId: 'C0001',
          senderUserId: 'U0002',
          text: mentionMessageText,
          timestamp: '1762700100.000200',
        },
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

      expect(store.listMessages()).toContainEqual({
        workspaceTeamId: 'T0001',
        conversationId: 'C0002',
        senderUserId: 'U0003',
        text: threadReplyText,
        timestamp: '1762700300.000400',
      });
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
});
