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
      getMe: () => Promise.resolve({ id: { toString: () => '1' }, firstName: '', lastName: '' }),
    };
    const client = createGramjsTelegramClient(gramjsClient);

    const sent = await client.sendText('42', 'Sending it now');

    expect(sentMessages).toEqual([{ entity: '42', message: 'Sending it now' }]);
    expect(sent).toEqual({ messageId: '314' });
  });

  it('reports its own account as the id and full name gramjs getMe reports', async () => {
    const gramjsClient = {
      sendMessage: () => Promise.resolve({ id: 1 }),
      getMe: () => Promise.resolve({ id: { toString: () => '777001' }, firstName: 'Ana', lastName: 'Torres' }),
    };
    const client = createGramjsTelegramClient(gramjsClient);

    const ownAccount = await client.getOwnAccount();

    expect(ownAccount).toEqual({ id: '777001', name: 'Ana Torres' });
  });
});
