import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { getJson, postJson, temporaryDatabasePath } from './app.test-support';
import { openChatMessageStore } from './chat-message-store';

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
});
