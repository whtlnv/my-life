import { describe, expect, it } from 'vitest';

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
});
