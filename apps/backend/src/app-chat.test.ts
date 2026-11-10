import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { getJson, postJson, temporaryDatabasePath } from './app.test-support';
import { openChatMessageStore } from './chat-message-store';
import { createScriptedTelegramClient } from './scripted-telegram-client';

describe('createApp chat messages', () => {
  it('lists at GET /chat-messages the chat messages stored in the chat store', async () => {
    const databasePath = temporaryDatabasePath();
    const storedMessage = {
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '42',
      senderId: '7001',
      senderName: 'Lucía Romero',
      text: 'Can we move our call to Thursday?',
      time: '2026-11-09T16:00:00.000Z',
      sentByUser: false,
    };
    openChatMessageStore(databasePath).saveMessage(storedMessage);
    const app = createApp({ allowedEmails: [], databasePath });

    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(messages).toEqual([storedMessage]);
  });

  it('stores an ignore verdict on that chat message at POST /chat-verdicts', async () => {
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: [], databasePath });
    const verdict = { channel: 'telegram', chatId: '7001', messageId: '42', decision: 'ignore' };

    const response = await postJson(app, '/chat-verdicts', verdict);

    expect(response.status).toBe(200);
    expect(openChatMessageStore(databasePath).listVerdicts()).toEqual([verdict]);
  });

  it('lists at GET /tasks an open task linked to the Telegram chat, on account telegram, once the user picks task at POST /chat-verdicts', async () => {
    const databasePath = temporaryDatabasePath();
    openChatMessageStore(databasePath).saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '42',
      senderId: '7001',
      senderName: 'Lucía Romero',
      text: 'Can we move our call to Thursday?',
      time: '2026-11-09T16:00:00.000Z',
      sentByUser: false,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    await postJson(app, '/chat-verdicts', { channel: 'telegram', chatId: '7001', messageId: '42', decision: 'task' });
    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');

    expect(tasks).toEqual([
      expect.objectContaining({
        status: 'open',
        title: 'Can we move our call to Thursday?',
        link: 'https://web.telegram.org/k/#7001',
        accountEmail: 'telegram',
      }),
    ]);
  });
  it('sends text at POST /chat-sends through the Telegram session and lists it as sent by the user under the id Telegram returned', async () => {
    const databasePath = temporaryDatabasePath();
    const scriptedTelegram = createScriptedTelegramClient({
      dialogs: [{ chatId: '7001', chatTitle: 'Lucía Romero', unreadCount: 1, messages: [] }],
    });
    const idsTelegramReturned: string[] = [];
    const telegramClient = {
      ...scriptedTelegram,
      sendText: async (chatId: string, text: string) => {
        const sent = await scriptedTelegram.sendText(chatId, text);
        idsTelegramReturned.push(sent.messageId);
        return sent;
      },
    };
    const app = createApp({ allowedEmails: [], databasePath, telegramClient });

    const response = await postJson(app, '/chat-sends', {
      channel: 'telegram',
      chatId: '7001',
      text: 'Thursday works, same time',
    });
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(response.status).toBe(200);
    expect(idsTelegramReturned).toHaveLength(1);
    expect(messages).toEqual([
      expect.objectContaining({
        channel: 'telegram',
        chatId: '7001',
        messageId: idsTelegramReturned[0],
        text: 'Thursday works, same time',
        sentByUser: true,
      }),
    ]);
  });

  it('refuses at POST /chat-sends, with 400, a send with empty text, and sends and stores nothing', async () => {
    const databasePath = temporaryDatabasePath();
    const scriptedTelegram = createScriptedTelegramClient({
      dialogs: [{ chatId: '7001', chatTitle: 'Lucía Romero', unreadCount: 1, messages: [] }],
    });
    const textsSentToTelegram: string[] = [];
    const telegramClient = {
      ...scriptedTelegram,
      sendText: async (chatId: string, text: string) => {
        textsSentToTelegram.push(text);
        return scriptedTelegram.sendText(chatId, text);
      },
    };
    const app = createApp({ allowedEmails: [], databasePath, telegramClient });

    const response = await postJson(app, '/chat-sends', { channel: 'telegram', chatId: '7001', text: '' });
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(response.status).toBe(400);
    expect(textsSentToTelegram).toEqual([]);
    expect(messages).toEqual([]);
  });
});
