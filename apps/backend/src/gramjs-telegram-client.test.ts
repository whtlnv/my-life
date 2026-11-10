import { describe, expect, it } from 'vitest';

import { createGramjsTelegramClient } from './gramjs-telegram-client';

describe('createGramjsTelegramClient', () => {
  it('sends text to a chat and returns the id of the message gramjs reports sent', async () => {
    const sentMessages: { entity: unknown; message: unknown }[] = [];
    const gramjsClient = {
      sendMessage: (entity: unknown, { message }: { message: string }) => {
        sentMessages.push({ entity, message });
        return Promise.resolve({ id: 314 });
      },
    };
    const client = createGramjsTelegramClient(gramjsClient);

    const sent = await client.sendText('42', 'Sending it now');

    expect(sentMessages).toEqual([{ entity: '42', message: 'Sending it now' }]);
    expect(sent).toEqual({ messageId: '314' });
  });
});
