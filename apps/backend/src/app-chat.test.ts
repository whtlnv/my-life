import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { budgetReviewReport, getJson, postJson, temporaryDatabasePath } from './app.test-support';
import { openChatMessageStore } from './chat-message-store';
import { createScriptedTelegramClient } from './scripted-telegram-client';
import { openSlackMessageStore } from './slack-message-store';

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

function saveTelegramMessageFromLucia(databasePath: string, time: string) {
  openChatMessageStore(databasePath).saveMessage({
    channel: 'telegram',
    chatId: '7001',
    chatTitle: 'Lucía Romero',
    messageId: '42',
    senderId: '7001',
    senderName: 'Lucía Romero',
    text: 'Can we move our call to Thursday?',
    time,
    sentByUser: false,
  });
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
  it('lists at GET /people under VIP, after a backend restart on the same database file, a Telegram contact marked vip through PUT /telegram-contacts/:userId/marks/vip before it', async () => {
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
    const beforeRestart = createApp({ allowedEmails: [], databasePath });
    await beforeRestart.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });

    const afterRestart = createApp({ allowedEmails: [], databasePath });
    const { vip } = await getJson<{ vip: unknown[] }>(afterRestart, '/people');

    expect(vip).toEqual([expect.objectContaining({ telegramHandles: [{ userId: '7001' }] })]);
  });
  it('leaves out of Everyone else at GET /people a Telegram contact marked vip through PUT /telegram-contacts/:userId/marks/vip, listing it under VIP only', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const app = createApp({ allowedEmails: [], databasePath });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });

    const { vip, everyoneElse } = await getJson<{ vip: unknown[]; everyoneElse: unknown[] }>(app, '/people');

    expect(vip).toEqual([expect.objectContaining({ telegramHandles: [{ userId: '7001' }] })]);
    expect(everyoneElse).toEqual([]);
  });
  it('lists at GET /people under Urgent, with the reason "VIP waiting", a Telegram contact marked vip through PUT /telegram-contacts/:userId/marks/vip whose message has waited more than 1 business day for a reply', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-02T17:00:00.000Z');
    const app = createApp({
      allowedEmails: [],
      databasePath,
      clock: { now: () => new Date('2026-11-04T17:00:00.000Z') },
    });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([
      expect.objectContaining({
        channel: 'telegram',
        displayName: 'Lucía Romero',
        telegramHandles: [{ userId: '7001' }],
        reasons: ['VIP waiting'],
      }),
    ]);
  });
  it('leaves out of Urgent at GET /people a Telegram contact marked vip whose message has waited less than 1 business day for a reply', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-04T15:00:00.000Z');
    const app = createApp({
      allowedEmails: [],
      databasePath,
      clock: { now: () => new Date('2026-11-04T17:00:00.000Z') },
    });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([]);
  });
  it('lists at GET /waiting-on, on channel telegram and waiting since its time, the sender of a Telegram chat whose newest message is not the user\'s', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const app = createApp({ allowedEmails: [], databasePath });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([
      expect.objectContaining({
        channel: 'telegram',
        displayName: 'Lucía Romero',
        waitingSince: '2026-11-09T16:00:00.000Z',
      }),
    ]);
  });

  it('leaves out of GET /waiting-on a Telegram chat whose newest message is the user\'s', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T15:00:00.000Z');
    openChatMessageStore(databasePath).saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '43',
      senderId: '9000',
      senderName: 'Francisco',
      text: 'Thursday works.',
      time: '2026-11-09T16:00:00.000Z',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([]);
  });
  it('orders Telegram, email and Slack people together at GET /waiting-on, the one who has waited longest first', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-02T12:00:00.000Z');
    openSlackMessageStore(databasePath).saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1793556000.000100',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(app, '/mail-report', budgetReviewReport);

    const { people } = await getJson<{ people: { displayName: string; waitingSince: string }[] }>(app, '/waiting-on');

    expect(people.map(({ displayName, waitingSince }) => ({ displayName, waitingSince }))).toEqual([
      { displayName: 'Ana', waitingSince: '2026-11-01T18:00:00.000Z' },
      { displayName: 'Lucía Romero', waitingSince: '2026-11-02T12:00:00.000Z' },
      { displayName: 'Luis', waitingSince: '2026-11-02T15:00:00.000Z' },
    ]);
  });

  it('reports Telegram at GET /now as not logged in when the app runs with Telegram off', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });

    const { telegram } = await getJson<{ telegram: unknown }>(app, '/now');

    expect(telegram).toEqual({ loggedIn: false });
  });

  it('reports Telegram at GET /now as connected with the time of the last message received when Telegram is on', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const { telegramClient } = recordingTelegramClient();
    const app = createApp({ allowedEmails: [], databasePath, telegramClient });

    const { telegram } = await getJson<{ telegram: unknown }>(app, '/now');

    expect(telegram).toEqual({ loggedIn: true, lastMessageAt: '2026-11-09T16:00:00.000Z' });
  });

  it('reports Telegram at GET /now as connected with the time of the last start when Telegram is on and no Telegram message has arrived yet', async () => {
    const { telegramClient } = recordingTelegramClient();
    const app = createApp({
      allowedEmails: [],
      databasePath: temporaryDatabasePath(),
      telegramClient,
      clock: { now: () => new Date('2026-11-10T06:15:00.000Z') },
    });

    const { telegram } = await getJson<{ telegram: unknown }>(app, '/now');

    expect(telegram).toEqual({ loggedIn: true, lastStartedAt: '2026-11-10T06:15:00.000Z' });
  });

  it('reports Telegram at GET /now as stale when the client has been disconnected for more than twice the 60 s check interval', async () => {
    const { telegramClient } = recordingTelegramClient();
    let currentTime = new Date('2026-11-10T06:15:00.000Z');
    const app = createApp({
      allowedEmails: [],
      databasePath: temporaryDatabasePath(),
      telegramClient: { ...telegramClient, isConnected: () => false },
      clock: { now: () => currentTime },
    });
    currentTime = new Date('2026-11-10T06:17:01.000Z');

    const { telegram } = await getJson<{ telegram: unknown }>(app, '/now');

    expect(telegram).toEqual({ loggedIn: true, lastStartedAt: '2026-11-10T06:15:00.000Z', stale: true });
  });
});
