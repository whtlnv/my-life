import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { getJson, postJson, temporaryDatabasePath } from './app.test-support';
import { openChatMessageStore } from './chat-message-store';
import { createScriptedTelegramClient } from './scripted-telegram-client';

function recordingTelegramClient() {
  const scriptedTelegram = createScriptedTelegramClient({
    dialogs: [{ chatId: '7001', chatTitle: 'Lucía Romero', unreadCount: 1, messages: [] }],
  });
  const textsSentToTelegram: string[] = [];
  const idsTelegramReturned: string[] = [];
  const telegramClient = {
    ...scriptedTelegram,
    sendText: async (chatId: string, text: string) => {
      textsSentToTelegram.push(text);
      const sent = await scriptedTelegram.sendText(chatId, text);
      idsTelegramReturned.push(sent.messageId);
      return sent;
    },
  };
  return { telegramClient, textsSentToTelegram, idsTelegramReturned };
}

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
    const { telegramClient, idsTelegramReturned } = recordingTelegramClient();
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

  it('stores a reply sent at POST /chat-sends with the chat title of the chat\'s stored messages and the user\'s own Telegram id and name', async () => {
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
    const { telegramClient: recordingClient } = recordingTelegramClient();
    const telegramClient = {
      ...recordingClient,
      getOwnAccount: () => Promise.resolve({ id: '777001', name: 'Ana Torres' }),
    };
    const app = createApp({ allowedEmails: [], databasePath, telegramClient });

    await postJson(app, '/chat-sends', { channel: 'telegram', chatId: '7001', text: 'Thursday works, same time' });
    const { messages } = await getJson<{ messages: { sentByUser: boolean }[] }>(app, '/chat-messages');

    expect(messages.filter((message) => message.sentByUser)).toEqual([
      expect.objectContaining({ chatTitle: 'Lucía Romero', senderId: '777001', senderName: 'Ana Torres' }),
    ]);
  });

  it('refuses at POST /chat-sends, with 400, a send with empty text, and sends and stores nothing', async () => {
    const databasePath = temporaryDatabasePath();
    const { telegramClient, textsSentToTelegram } = recordingTelegramClient();
    const app = createApp({ allowedEmails: [], databasePath, telegramClient });

    const response = await postJson(app, '/chat-sends', { channel: 'telegram', chatId: '7001', text: '' });
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(response.status).toBe(400);
    expect(textsSentToTelegram).toEqual([]);
    expect(messages).toEqual([]);
  });

  it('refuses at POST /chat-sends, with 400, a send to a channel that is not configured, and sends and stores nothing', async () => {
    const databasePath = temporaryDatabasePath();
    const { telegramClient, textsSentToTelegram } = recordingTelegramClient();
    const app = createApp({ allowedEmails: [], databasePath, telegramClient });

    const response = await postJson(app, '/chat-sends', {
      channel: 'whatsapp',
      chatId: '7001',
      text: 'Thursday works, same time',
    });
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(response.status).toBe(400);
    expect(textsSentToTelegram).toEqual([]);
    expect(messages).toEqual([]);
  });

  it('answers POST /chat-sends with 502 and the Telegram error when Telegram refuses the send, and stores nothing', async () => {
    const databasePath = temporaryDatabasePath();
    const telegramClient = {
      sendText: () => Promise.reject(new Error('CHAT_WRITE_FORBIDDEN')),
    };
    const app = createApp({ allowedEmails: [], databasePath, telegramClient });

    const response = await postJson(app, '/chat-sends', {
      channel: 'telegram',
      chatId: '7001',
      text: 'Thursday works, same time',
    });
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'CHAT_WRITE_FORBIDDEN' });
    expect(messages).toEqual([]);
  });

  it('refuses at POST /chat-sends, with 400, a Telegram send while Telegram is off, and stores nothing', async () => {
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: [], databasePath });

    const response = await postJson(app, '/chat-sends', {
      channel: 'telegram',
      chatId: '7001',
      text: 'Thursday works, same time',
    });
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(response.status).toBe(400);
    expect(messages).toEqual([]);
  });

  it('lists at GET /triage-queue a Telegram chat whose newest message is from someone else and has no verdict as a chat item with its chat title, sender and time', async () => {
    const databasePath = temporaryDatabasePath();
    const store = openChatMessageStore(databasePath);
    store.saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '41',
      senderId: '7001',
      senderName: 'Lucía Romero',
      text: 'Are you around this week?',
      time: '2026-11-09T15:00:00.000Z',
      sentByUser: false,
    });
    store.saveMessage({
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

    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([
      expect.objectContaining({
        channel: 'telegram',
        chatId: '7001',
        messageId: '42',
        chatTitle: 'Lucía Romero',
        senderName: 'Lucía Romero',
        time: '2026-11-09T16:00:00.000Z',
      }),
    ]);
  });

  it('leaves out of GET /triage-queue a Telegram chat whose newest message is the user\'s', async () => {
    const databasePath = temporaryDatabasePath();
    const store = openChatMessageStore(databasePath);
    store.saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '41',
      senderId: '7001',
      senderName: 'Lucía Romero',
      text: 'Can we move our call to Thursday?',
      time: '2026-11-09T15:00:00.000Z',
      sentByUser: false,
    });
    store.saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '42',
      senderId: '9000',
      senderName: 'Francisco',
      text: 'Thursday works.',
      time: '2026-11-09T16:00:00.000Z',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([]);
  });

  it('leaves out of GET /triage-queue a Telegram chat whose newest message has a verdict', async () => {
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

    await postJson(app, '/chat-verdicts', { channel: 'telegram', chatId: '7001', messageId: '42', decision: 'ignore' });
    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([]);
  });

  it('lists at GET /people, under Everyone else on channel telegram, the sender of a Telegram message as a contact with a Telegram handle of their user id and their display name', async () => {
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

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([
      expect.objectContaining({
        channel: 'telegram',
        displayName: 'Lucía Romero',
        telegramHandles: [{ userId: '7001' }],
      }),
    ]);
  });
  it('leaves out of GET /people a Telegram message the user sent, so the user is not listed as their own contact', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
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
    chatMessageStore.saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '43',
      senderId: '9000',
      senderName: 'Francisco',
      text: 'Thursday works.',
      time: '2026-11-09T16:05:00.000Z',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([expect.objectContaining({ telegramHandles: [{ userId: '7001' }] })]);
  });
  it('lists at GET /telegram-contacts/:userId/timeline the Telegram messages that contact sent, newest first, each with its channel', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    const fromLucia = {
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      senderId: '7001',
      senderName: 'Lucía Romero',
      sentByUser: false,
    };
    chatMessageStore.saveMessage({
      ...fromLucia,
      messageId: '42',
      text: 'Can we move our call to Thursday?',
      time: '2026-11-09T16:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      channel: 'telegram',
      chatId: '7002',
      chatTitle: 'Bruno Díaz',
      messageId: '50',
      senderId: '7002',
      senderName: 'Bruno Díaz',
      text: 'Lunch on Friday?',
      time: '2026-11-09T16:30:00.000Z',
      sentByUser: false,
    });
    chatMessageStore.saveMessage({
      ...fromLucia,
      messageId: '44',
      text: 'Or Friday morning, if Thursday is full.',
      time: '2026-11-09T17:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { messages } = await getJson<{ messages: unknown[] }>(app, '/telegram-contacts/7001/timeline');

    expect(messages).toEqual([
      expect.objectContaining({ channel: 'telegram', text: 'Or Friday morning, if Thursday is full.' }),
      expect.objectContaining({ channel: 'telegram', text: 'Can we move our call to Thursday?' }),
    ]);
  });
});
