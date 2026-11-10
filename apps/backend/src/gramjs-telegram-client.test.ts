import { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { describe, expect, it } from 'vitest';

import { createGramjsTelegramClient } from './gramjs-telegram-client';
import { mapTelegramMessage } from './telegram-message-mapping';

function stubGramjsClient(overrides: Partial<Parameters<typeof createGramjsTelegramClient>[0]> = {}) {
  return {
    sendMessage: () => Promise.resolve({ id: 1 }),
    getMe: () => Promise.resolve({ id: { toString: () => '1' }, firstName: '', lastName: '' }),
    getDialogs: () => Promise.resolve([]),
    getMessages: () => Promise.resolve([]),
    addEventHandler: () => undefined,
    ...overrides,
  };
}

describe('createGramjsTelegramClient', () => {
  it('sends text to a chat by its marked peer id as a big-integer entity and returns the id of the message gramjs reports sent', async () => {
    const sentMessages: { entity: unknown; message: unknown }[] = [];
    const gramjsClient = stubGramjsClient({
      sendMessage: (entity, { message }) => {
        sentMessages.push({ entity, message });
        return Promise.resolve({ id: 314 });
      },
    });
    const client = createGramjsTelegramClient(gramjsClient);

    const sent = await client.sendText('-100707070', 'Sending it now');

    expect(sentMessages).toEqual([{ entity: returnBigInt('-100707070'), message: 'Sending it now' }]);
    expect(sent).toEqual({ messageId: '314' });
  });

  it('reports its own account as the id and full name gramjs getMe reports', async () => {
    const gramjsClient = stubGramjsClient({
      getMe: () => Promise.resolve({ id: { toString: () => '777001' }, firstName: 'Ana', lastName: 'Torres' }),
    });
    const client = createGramjsTelegramClient(gramjsClient);

    const ownAccount = await client.getOwnAccount();

    expect(ownAccount).toEqual({ id: '777001', name: 'Ana Torres' });
  });

  it('lists each dialog with its unread count and its recent messages mapped by the Telegram mapping, dropping what the mapping drops', async () => {
    const luis = new Api.User({ id: returnBigInt(424242), firstName: 'Luis', lastName: 'Ortega' });
    const textMessage = new Api.Message({
      id: 1017,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T16:30:00.000Z') / 1000,
      message: '¿Nos vemos el jueves?',
      out: false,
    });
    textMessage._sender = luis;
    const photoOnlyMessage = new Api.Message({
      id: 1018,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T16:31:00.000Z') / 1000,
      message: '',
      out: false,
    });
    photoOnlyMessage._sender = luis;
    const requestedEntities: unknown[] = [];
    const gramjsClient = stubGramjsClient({
      getDialogs: () => Promise.resolve([{ entity: luis, unreadCount: 2 }]),
      getMessages: (entity) => {
        requestedEntities.push(entity);
        return Promise.resolve([textMessage, photoOnlyMessage]);
      },
    });
    const client = createGramjsTelegramClient(gramjsClient);

    const dialogs = await client.listDialogs();

    expect(requestedEntities).toEqual([luis]);
    expect(dialogs).toEqual([
      {
        unreadCount: 2,
        messages: [mapTelegramMessage({ message: textMessage, chat: luis, sender: luis })],
      },
    ]);
  });

  it('hands each new message gramjs delivers to the onMessage handler, mapped, and drops what the mapping drops', async () => {
    const luis = new Api.User({ id: returnBigInt(424242), firstName: 'Luis', lastName: 'Ortega' });
    const textMessage = new Api.Message({
      id: 1019,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T17:00:00.000Z') / 1000,
      message: 'Ya llegué',
      out: false,
    });
    textMessage._sender = luis;
    textMessage._chat = luis;
    const photoOnlyMessage = new Api.Message({
      id: 1020,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T17:01:00.000Z') / 1000,
      message: '',
      out: false,
    });
    photoOnlyMessage._sender = luis;
    photoOnlyMessage._chat = luis;
    const newMessageCallbacks: ((event: { message: Api.Message }) => unknown)[] = [];
    const gramjsClient = stubGramjsClient({
      addEventHandler: (callback: (event: { message: Api.Message }) => unknown) => {
        newMessageCallbacks.push(callback);
      },
    });
    const client = createGramjsTelegramClient(gramjsClient);
    const handled: unknown[] = [];

    client.onMessage((message) => handled.push(message));
    for (const callback of newMessageCallbacks) {
      await callback({ message: textMessage });
      await callback({ message: photoOnlyMessage });
    }

    expect(handled).toEqual([mapTelegramMessage({ message: textMessage, chat: luis, sender: luis })]);
  });
});
