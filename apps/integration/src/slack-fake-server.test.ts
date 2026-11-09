import { describe, expect, it } from 'vitest';

import { directMessageText, startSlackFakeServer } from './slack-fake-server';

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
});
