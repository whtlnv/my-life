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
});
