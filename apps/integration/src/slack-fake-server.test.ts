import { describe, expect, it } from 'vitest';

import { directMessageText, mentionMessageText, startSlackFakeServer, userId } from './slack-fake-server';

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
        await fetch(`${slack.url}/search.messages?query=${encodeURIComponent(`<@${userId}>`)}`, {
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
      expect(match?.text).toContain(`<@${userId}>`);
    } finally {
      await slack.close();
    }
  });
});
