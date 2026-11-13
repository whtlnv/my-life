import { describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import {
  budgetReviewReport,
  clockAtTenPastThree,
  getJson,
  pendingCommandsOf,
  postAcknowledgement,
  postJson,
  postTriageRun,
  temporaryDatabasePath,
} from './app.test-support';
import { openChatMessageStore } from './chat-message-store';
import { createScriptedTelegramClient } from './scripted-telegram-client';
import { openSlackMessageStore } from './slack-message-store';
import { openSpendStore } from './spend-store';

const goodWhatsappReport = {
  channel: 'whatsapp',
  chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '2026-11-02T09:00:00-06:00' }],
  openChat: { title: 'Ana', messages: [] },
};

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

function summarizerFailingValidation() {
  let calls = 0;
  const summary = {
    summarize: () => {
      calls += 1;
      return Promise.reject(
        Object.assign(new Error('The summary model answered with output that fails validation'), { costInUsd: 0.25 }),
      );
    },
  };
  return { summary, summaryCalls: () => calls };
}

const bbvaAlertsBotMessage = {
  channel: 'telegram',
  chatId: '8001',
  chatTitle: 'BBVA Alertas',
  senderId: '8001',
  senderName: 'BBVA Alertas',
  sentByUser: false,
  chatIsBot: true,
};

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

  it('stores at POST /chat-messages the messages of a valid WhatsApp report and lists them at GET /chat-messages with channel whatsapp', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    const report = {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    };

    await postJson(app, '/chat-messages', report);
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(messages).toEqual([
      expect.objectContaining({
        channel: 'whatsapp',
        chatTitle: 'Ana',
        messageId: '3EB0A1B2C3D4E5F6',
        senderName: 'Ana',
        text: 'Can we move the call to tomorrow?',
        sentByUser: false,
      }),
    ]);
  });

  it('stores at POST /chat-messages an unread chat with a preview that is not the open chat as one incoming message, timed when the backend received it', async () => {
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath: temporaryDatabasePath() });
    const report = {
      channel: 'whatsapp',
      chats: [
        { title: 'Ana', unreadCount: 0, lastMessageAt: '9:00 am' },
        { title: 'Bruno', unreadCount: 2, lastMessageAt: '9:41 pm', lastMessagePreview: 'Are you coming tonight?' },
      ],
      openChat: { title: 'Ana', messages: [] },
    };

    await postJson(app, '/chat-messages', report);
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(messages).toEqual([
      expect.objectContaining({
        channel: 'whatsapp',
        chatId: 'Bruno',
        chatTitle: 'Bruno',
        messageId: 'preview:9:41 pm',
        senderId: 'Bruno',
        senderName: 'Bruno',
        text: 'Are you coming tonight?',
        time: '2026-11-02T15:10:00.000Z',
        sentByUser: false,
      }),
    ]);
  });

  it('stores nothing at POST /chat-messages from a reported chat with no unread messages', async () => {
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath: temporaryDatabasePath() });
    const report = {
      channel: 'whatsapp',
      chats: [
        { title: 'Ana', unreadCount: 0, lastMessageAt: '9:00 am' },
        { title: 'Bruno', unreadCount: 0, lastMessageAt: '9:41 pm', lastMessagePreview: 'See you tomorrow' },
      ],
      openChat: { title: 'Ana', messages: [] },
    };

    await postJson(app, '/chat-messages', report);
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(messages).toEqual([]);
  });

  it('refuses at POST /chat-messages, with 400, a body that fails the WhatsApp report schema, and stores nothing', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    const reportWithMessageMissingItsId = {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    };

    const response = await postJson(app, '/chat-messages', reportWithMessageMissingItsId);
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');

    expect(response.status).toBe(400);
    expect(messages).toEqual([]);
  });

  it('keeps at GET /now the time of the last good WhatsApp report once a parser failure follows it', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath(), clock: clockAtTenPastThree });
    await postJson(app, '/chat-messages', goodWhatsappReport);

    await postJson(app, '/chat-messages', { channel: 'whatsapp', ok: false, missingSelector: '[data-pre-plain-text]' });
    const { whatsapp } = await getJson<{ whatsapp: unknown }>(app, '/now');

    expect(whatsapp).toMatchObject({ parserBroken: true, lastReportedAt: clockAtTenPastThree.now().toISOString() });
  });

  it('reports WhatsApp at GET /now as parser broken, naming the missing selector, after POST /chat-messages with a parser failure', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    const parserFailure = { channel: 'whatsapp', ok: false, missingSelector: '[data-pre-plain-text]' };

    await postJson(app, '/chat-messages', parserFailure);
    const { whatsapp } = await getJson<{ whatsapp: unknown }>(app, '/now');

    expect(whatsapp).toEqual(expect.objectContaining({ parserBroken: true, missingSelector: '[data-pre-plain-text]' }));
  });

  it('reports WhatsApp at GET /now as healthy, with the time of the report, after a good report follows a parser failure', async () => {
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath: temporaryDatabasePath() });
    const parserFailure = { channel: 'whatsapp', ok: false, missingSelector: '[data-pre-plain-text]' };

    await postJson(app, '/chat-messages', parserFailure);
    await postJson(app, '/chat-messages', goodWhatsappReport);
    const { whatsapp } = await getJson<{ whatsapp: unknown }>(app, '/now');

    expect(whatsapp).toMatchObject({
      parserBroken: false,
      lastReportedAt: clockAtTenPastThree.now().toISOString(),
    });
  });

  it.each([
    {
      reportedTo: 'not stale when the last report arrived one second ago',
      nowAfterReport: '2026-11-10T15:10:01.000Z',
      reportInterval: undefined,
      stale: false,
    },
    {
      reportedTo: 'stale when the last report arrived an hour ago',
      nowAfterReport: '2026-11-10T16:10:00.000Z',
      reportInterval: undefined,
      stale: true,
    },
    {
      reportedTo: 'fresh an hour after the last report when the configured report interval is an hour',
      nowAfterReport: '2026-11-10T16:10:00.000Z',
      reportInterval: 3_600_000,
      stale: false,
    },
  ])('reports WhatsApp at GET /now as $reportedTo', async ({ nowAfterReport, reportInterval, stale }) => {
    let currentTime = new Date('2026-11-10T15:10:00.000Z');
    const app = createApp({
      allowedEmails: [],
      databasePath: temporaryDatabasePath(),
      clock: { now: () => currentTime },
      ...(reportInterval === undefined ? {} : { whatsappReportIntervalInMilliseconds: reportInterval }),
    });
    await postJson(app, '/chat-messages', goodWhatsappReport);
    currentTime = new Date(nowAfterReport);

    const { whatsapp } = await getJson<{ whatsapp: unknown }>(app, '/now');

    expect(whatsapp).toMatchObject({ lastReportedAt: '2026-11-10T15:10:00.000Z', stale });
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

  it('lists at GET /tasks a task linked to the WhatsApp chat, on account whatsapp, once the user picks task on a WhatsApp triage item at POST /chat-verdicts', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    });
    const {
      chatItems: [item],
    } = await getJson<{ chatItems: { channel: string; chatId: string; messageId: string; link: string }[] }>(
      app,
      '/triage-queue',
    );

    await postJson(app, '/chat-verdicts', {
      channel: item?.channel,
      chatId: item?.chatId,
      messageId: item?.messageId,
      decision: 'task',
    });
    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');

    expect(tasks).toEqual([
      expect.objectContaining({
        title: 'Can we move the call to tomorrow?',
        link: item?.link,
        accountEmail: 'whatsapp',
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

  it("stores a reply sent at POST /chat-sends with the chat title of the chat's stored messages and the user's own Telegram id and name", async () => {
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

  it('queues at POST /chat-sends a send-whatsapp command with the chat title and text, listed at GET /commands for the profile that reports WhatsApp', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', { ...goodWhatsappReport, accountEmail: 'ana@example.com' });

    await postJson(app, '/chat-sends', { channel: 'whatsapp', chatId: 'Ana', text: 'Tomorrow at ten works' });
    const { commands } = await getJson<{ commands: unknown[] }>(app, '/commands?accountEmail=ana%40example.com');

    expect(commands).toEqual([
      expect.objectContaining({ type: 'send-whatsapp', chatTitle: 'Ana', text: 'Tomorrow at ten works' }),
    ]);
  });

  it('lists at GET /commands, after a restart, a new send-whatsapp command queued once an earlier one was acknowledged', async () => {
    const databasePath = temporaryDatabasePath();
    const appBeforeRestart = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(appBeforeRestart, '/chat-messages', { ...goodWhatsappReport, accountEmail: 'ana@example.com' });
    await postJson(appBeforeRestart, '/chat-sends', {
      channel: 'whatsapp',
      chatId: 'Ana',
      text: 'Tomorrow at ten works',
    });
    const [acknowledged] = await pendingCommandsOf<{ id: string }>(appBeforeRestart, 'ana@example.com');
    await postAcknowledgement(appBeforeRestart, String(acknowledged?.id));
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(app, '/chat-messages', { ...goodWhatsappReport, accountEmail: 'ana@example.com' });

    await postJson(app, '/chat-sends', { channel: 'whatsapp', chatId: 'Ana', text: 'See you there' });

    expect(await pendingCommandsOf(app, 'ana@example.com')).toEqual([
      expect.objectContaining({ type: 'send-whatsapp', chatTitle: 'Ana', text: 'See you there' }),
    ]);
  });

  it('refuses at POST /chat-sends, with 400, a WhatsApp send with empty text, and queues no command', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', { ...goodWhatsappReport, accountEmail: 'ana@example.com' });

    const response = await postJson(app, '/chat-sends', { channel: 'whatsapp', chatId: 'Ana', text: '' });
    const { commands } = await getJson<{ commands: unknown[] }>(app, '/commands?accountEmail=ana%40example.com');

    expect(response.status).toBe(400);
    expect(commands).toEqual([]);
  });

  it('lists at GET /triage-queue a WhatsApp chat item with its reply pending while the send-whatsapp command is unacknowledged', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      accountEmail: 'ana@example.com',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    });

    await postJson(app, '/chat-sends', { channel: 'whatsapp', chatId: 'Ana', text: 'Tomorrow at ten works' });
    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([
      expect.objectContaining({ channel: 'whatsapp', chatId: 'Ana', pendingReply: 'Tomorrow at ten works' }),
    ]);
  });

  it('lists at GET /triage-queue a WhatsApp chat item without a pending reply once the send-whatsapp command is acknowledged', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      accountEmail: 'ana@example.com',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    });
    await postJson(app, '/chat-sends', { channel: 'whatsapp', chatId: 'Ana', text: 'Tomorrow at ten works' });
    const [command] = await pendingCommandsOf<{ id: string }>(app, 'ana@example.com');

    await postAcknowledgement(app, String(command?.id));
    const { chatItems } = await getJson<{ chatItems: { chatId: string; pendingReply?: string }[] }>(
      app,
      '/triage-queue',
    );

    expect(chatItems.map(({ chatId, pendingReply }) => ({ chatId, pendingReply }))).toEqual([
      { chatId: 'Ana', pendingReply: undefined },
    ]);
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

  it('lists at GET /triage-queue a Telegram chat item with its newest message text and a link that opens the chat in Telegram', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const app = createApp({ allowedEmails: [], databasePath });

    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([
      expect.objectContaining({
        text: 'Can we move our call to Thursday?',
        link: 'https://web.telegram.org/k/#7001',
      }),
    ]);
  });

  it('lists at GET /triage-queue an unanswered incoming WhatsApp message as a chat item with channel whatsapp and a link that opens WhatsApp Web', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    });

    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([
      expect.objectContaining({
        channel: 'whatsapp',
        chatTitle: 'Ana',
        senderName: 'Ana',
        text: 'Can we move the call to tomorrow?',
        link: 'https://web.whatsapp.com/',
      }),
    ]);
  });

  it("keeps at GET /triage-queue a WhatsApp message whose only stored verdict with its chat id and message id is on Telegram, since a verdict hides only its own channel's message", async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    });

    await postJson(app, '/chat-verdicts', {
      channel: 'telegram',
      chatId: 'Ana',
      messageId: '3EB0A1B2C3D4E5F6',
      decision: 'ignore',
    });
    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([expect.objectContaining({ channel: 'whatsapp', messageId: '3EB0A1B2C3D4E5F6' })]);
  });

  it("leaves out of GET /triage-queue a Telegram chat whose newest message is the user's", async () => {
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

  it('leaves out of GET /triage-queue a Telegram chat with a bot, though its newest message is from the bot and has no verdict', async () => {
    const databasePath = temporaryDatabasePath();
    openChatMessageStore(databasePath).saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { chatItems } = await getJson<{ chatItems: unknown[] }>(app, '/triage-queue');

    expect(chatItems).toEqual([]);
  });

  it("lists at GET /triage-queue a Telegram chat with a bot as a digest titled with the bot's name, on channel telegram, counting its unconfirmed messages", async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-09T17:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');

    expect(digests).toEqual([expect.objectContaining({ title: 'BBVA Alertas', channel: 'telegram', count: 2 })]);
  });

  it('lists at GET /triage-queue no digest for a Telegram chat with a bot whose messages are all confirmed', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-09T17:00:00.000Z',
    });
    chatMessageStore.saveVerdict({ channel: 'telegram', chatId: '8001', messageId: '77', decision: 'confirmed' });
    chatMessageStore.saveVerdict({ channel: 'telegram', chatId: '8001', messageId: '78', decision: 'confirmed' });
    const app = createApp({ allowedEmails: [], databasePath });

    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');

    expect(digests).toEqual([]);
  });

  it('leaves out of GET /triage-queue a Telegram bot digest once it is confirmed at POST /digests/:id/confirmation', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-09T17:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });
    const { digests: before } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');
    const confirmedDigestId = before[0]?.id ?? '';

    await app.request(`/digests/${encodeURIComponent(confirmedDigestId)}/confirmation`, { method: 'POST' });

    const { digests: after } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(after).toEqual([]);
  });

  it('lists at GET /triage-queue a fresh Telegram bot digest counting only a bot message that arrived after the previous digest was confirmed, without the confirmed digest’s summary lines', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:30:00.000Z',
    });
    const summary = {
      summarize: () => Promise.resolve({ lines: ['BBVA Alertas: 2 card charges'], costInUsd: 0.25 }),
    };
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath, summary });
    await postTriageRun(app);
    const { digests: before } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');
    await app.request(`/digests/${encodeURIComponent(before[0]?.id ?? '')}/confirmation`, { method: 'POST' });

    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '79',
      text: 'Cargo de $89.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T15:05:00.000Z',
    });

    const { digests: after } = await getJson<{ digests: object[] }>(app, '/triage-queue');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ title: 'BBVA Alertas', count: 1 });
    expect(after[0]).not.toHaveProperty('summaryLines');
  });

  it('leaves undecided, when a Telegram bot digest is confirmed, a bot message that arrived after the digest was loaded', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-09T17:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });
    const { digests: before } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '79',
      text: 'Cargo de $89.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T18:00:00.000Z',
    });

    await app.request(`/digests/${encodeURIComponent(before[0]?.id ?? '')}/confirmation`, { method: 'POST' });

    const { digests: after } = await getJson<{ digests: object[] }>(app, '/triage-queue');
    expect(after).toEqual([expect.objectContaining({ title: 'BBVA Alertas', count: 1 })]);
  });

  it('confirms, when a Telegram bot digest is confirmed, every bot message the digest listed when it was loaded', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    for (const [messageId, hour] of [
      ['81', 13],
      ['82', 14],
      ['83', 15],
    ] as const)
      chatMessageStore.saveMessage({
        ...bbvaAlertsBotMessage,
        messageId,
        text: `Cargo ${messageId} en tu tarjeta terminación 4321`,
        time: `2026-11-09T${hour}:00:00.000Z`,
      });
    const app = createApp({ allowedEmails: [], databasePath });
    const { digests: before } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');

    await app.request(`/digests/${encodeURIComponent(before[0]?.id ?? '')}/confirmation`, { method: 'POST' });

    const confirmedMessageIds = chatMessageStore
      .listVerdicts()
      .filter(({ decision }) => decision === 'confirmed')
      .map(({ messageId }) => messageId);
    expect(confirmedMessageIds.sort()).toEqual(['81', '82', '83']);
  });

  it('leaves out of GET /triage-queue a second Telegram bot digest in the same chat once it is confirmed, after the first was confirmed', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });
    const { digests: first } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');
    await app.request(`/digests/${encodeURIComponent(first[0]?.id ?? '')}/confirmation`, { method: 'POST' });
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-09T17:00:00.000Z',
    });
    const { digests: second } = await getJson<{ digests: { id: string }[] }>(app, '/triage-queue');

    await app.request(`/digests/${encodeURIComponent(second[0]?.id ?? '')}/confirmation`, { method: 'POST' });

    const { digests: after } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(after).toEqual([]);
  });

  it("writes at POST /triage-run a Telegram bot digest's summary lines from its messages' text, and logs the call's spend", async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:30:00.000Z',
    });
    const itemsSentToSummary: { summary: string }[][] = [];
    const summary = {
      summarize: (request: { items: { summary: string }[] }) => {
        itemsSentToSummary.push(request.items);
        return Promise.resolve({ lines: ['BBVA Alertas: 2 card charges'], costInUsd: 0.25 });
      },
    };
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath, summary });

    await postTriageRun(app);

    expect(itemsSentToSummary).toEqual([
      [
        { summary: 'Cargo de $1,250.00 en tu tarjeta terminación 4321' },
        { summary: 'Cargo de $310.50 en tu tarjeta terminación 4321' },
      ],
    ]);
    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(digests).toEqual([
      expect.objectContaining({ title: 'BBVA Alertas', summaryLines: ['BBVA Alertas: 2 card charges'] }),
    ]);
    expect(
      openSpendStore(databasePath)
        .loadAll()
        .map(({ spentAt, costInUsd }) => ({ spentAt, costInUsd })),
    ).toEqual([{ spentAt: '2026-11-02T15:10:00.000Z', costInUsd: 0.25 }]);
  });

  it('asks the summarizer at a second POST /triage-run about no Telegram bot digest whose messages are unchanged since the first run summarized it', async () => {
    const databasePath = temporaryDatabasePath();
    openChatMessageStore(databasePath).saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:00:00.000Z',
    });
    let summaryCalls = 0;
    const summary = {
      summarize: () => {
        summaryCalls += 1;
        return Promise.resolve({ lines: ['BBVA Alertas: 1 card charge'], costInUsd: 0.25 });
      },
    };
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath, summary });
    await postTriageRun(app);

    await postTriageRun(app);

    expect(summaryCalls).toBe(1);
  });

  it('asks the summarizer at a second POST /triage-run about no Telegram bot digest whose messages are unchanged since the first run’s summary call failed', async () => {
    const databasePath = temporaryDatabasePath();
    openChatMessageStore(databasePath).saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:00:00.000Z',
    });
    const { summary, summaryCalls } = summarizerFailingValidation();
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath, summary });
    await postTriageRun(app);

    await postTriageRun(app);

    expect(summaryCalls()).toBe(1);
  });

  it('asks the summarizer again at a second POST /triage-run about a Telegram bot digest that gained a message since the first run’s summary call failed', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:00:00.000Z',
    });
    const { summary, summaryCalls } = summarizerFailingValidation();
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath, summary });
    await postTriageRun(app);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:30:00.000Z',
    });

    await postTriageRun(app);

    expect(summaryCalls()).toBe(2);
  });

  it('summarizes a Telegram bot digest again at POST /triage-run, with every unconfirmed message, once a new bot message arrives after its last summary', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:00:00.000Z',
    });
    const itemsSentToSummary: { summary: string }[][] = [];
    const summary = {
      summarize: (request: { items: { summary: string }[] }) => {
        itemsSentToSummary.push(request.items);
        return Promise.resolve({
          lines: [`BBVA Alertas: ${String(request.items.length)} card charges`],
          costInUsd: 0.25,
        });
      },
    };
    const app = createApp({ allowedEmails: [], clock: clockAtTenPastThree, databasePath, summary });
    await postTriageRun(app);
    chatMessageStore.saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '78',
      text: 'Cargo de $310.50 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:30:00.000Z',
    });

    await postTriageRun(app);

    expect(itemsSentToSummary.at(-1)).toEqual([
      { summary: 'Cargo de $1,250.00 en tu tarjeta terminación 4321' },
      { summary: 'Cargo de $310.50 en tu tarjeta terminación 4321' },
    ]);
    const { digests } = await getJson<{ digests: unknown[] }>(app, '/triage-queue');
    expect(digests).toEqual([expect.objectContaining({ summaryLines: ['BBVA Alertas: 2 card charges'] })]);
  });

  it("writes no Telegram bot digest summary at POST /triage-run once today's spend reaches the daily ceiling, and still returns the digest in GET /triage-queue without summary lines", async () => {
    const databasePath = temporaryDatabasePath();
    openChatMessageStore(databasePath).saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-02T14:00:00.000Z',
    });
    openSpendStore(databasePath).save({ spentAt: '2026-11-02T15:00:00.000Z', model: 'claude-opus-5-5', costInUsd: 1 });
    let summaryCalls = 0;
    const summary = {
      summarize: () => {
        summaryCalls += 1;
        return Promise.resolve({ lines: ['BBVA Alertas: 1 card charge'], costInUsd: 0.25 });
      },
    };
    const app = createApp({
      allowedEmails: [],
      clock: clockAtTenPastThree,
      databasePath,
      dailySpendCeilingInUsd: 1,
      summary,
    });

    await postTriageRun(app);

    const { digests } = await getJson<{ digests: object[] }>(app, '/triage-queue');
    expect(summaryCalls).toBe(0);
    expect(digests).toHaveLength(1);
    expect(digests[0]).toMatchObject({ title: 'BBVA Alertas' });
    expect(digests[0]).not.toHaveProperty('summaryLines');
  });

  it('lists at GET /people, under Everyone else on channel telegram, the sender of a Telegram message as a contact with a Telegram handle of their user id and their display name', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
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
  it('leaves out of GET /people the sender of a Telegram chat with a bot, so a bot is not listed as a contact', async () => {
    const databasePath = temporaryDatabasePath();
    openChatMessageStore(databasePath).saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([]);
  });
  it('gives a Telegram contact at GET /people the time of their last message as lastMessageAt, so the row can show "last message …"', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const app = createApp({ allowedEmails: [], databasePath });

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([
      expect.objectContaining({ telegramHandles: [{ userId: '7001' }], lastMessageAt: '2026-11-09T16:00:00.000Z' }),
    ]);
  });
  it('lists a Telegram contact with several messages once at GET /people, with the time of their newest message as lastMessageAt', async () => {
    const databasePath = temporaryDatabasePath();
    const chatMessageStore = openChatMessageStore(databasePath);
    const fromLucia = {
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      senderId: '7001',
      senderName: 'Lucía Romero',
      sentByUser: false,
    } as const;
    chatMessageStore.saveMessage({
      ...fromLucia,
      messageId: '43',
      text: 'Thursday at 10 works for me.',
      time: '2026-11-09T18:00:00.000Z',
    });
    chatMessageStore.saveMessage({
      ...fromLucia,
      messageId: '42',
      text: 'Can we move our call to Thursday?',
      time: '2026-11-09T16:00:00.000Z',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([
      expect.objectContaining({ telegramHandles: [{ userId: '7001' }], lastMessageAt: '2026-11-09T18:00:00.000Z' }),
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
  it('gives each message at GET /telegram-contacts/:userId/timeline a link that opens its chat in Telegram', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const app = createApp({ allowedEmails: [], databasePath });

    const { messages } = await getJson<{ messages: unknown[] }>(app, '/telegram-contacts/7001/timeline');

    expect(messages).toEqual([expect.objectContaining({ link: 'https://web.telegram.org/k/#7001' })]);
  });
  it('lists at GET /people, under Everyone else on channel whatsapp, the sender of a WhatsApp message, and lists that message at GET /whatsapp-contacts/:name/timeline', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    });

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([
      expect.objectContaining({
        channel: 'whatsapp',
        displayName: 'Ana',
        whatsappHandles: [{ name: 'Ana' }],
        lastMessageAt: '2026-11-10T15:41:00.000Z',
      }),
    ]);
    const { messages } = await getJson<{ messages: unknown[] }>(app, '/whatsapp-contacts/Ana/timeline');
    expect(messages).toEqual([
      expect.objectContaining({ channel: 'whatsapp', text: 'Can we move the call to tomorrow?' }),
    ]);
  });
  it('lists a WhatsApp contact timeline at GET /whatsapp-contacts/:name/timeline newest first, each message with a link to WhatsApp', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    const fromAna = (id: string, sentAt: string, text: string) => ({
      id,
      sender: 'Ana',
      sentAt,
      text,
      sentByUser: false,
    });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '9:45 am' }],
      openChat: {
        title: 'Ana',
        messages: [
          fromAna('3EB0A1B2C3D4E5F8', '2026-11-10T09:41:00-06:00', 'Hola'),
          fromAna('3EB0A1B2C3D4E5F9', '2026-11-10T09:45:00-06:00', '¿Mañana?'),
        ],
      },
    });

    const { messages } = await getJson<{ messages: unknown[] }>(app, '/whatsapp-contacts/Ana/timeline');

    expect(messages).toEqual([
      expect.objectContaining({ text: '¿Mañana?', link: 'https://web.whatsapp.com/' }),
      expect.objectContaining({ text: 'Hola', link: 'https://web.whatsapp.com/' }),
    ]);
  });

  it('moves a WhatsApp contact into VIP at GET /people once marked through PUT /whatsapp-contacts/:name/marks/vip, and out again through DELETE', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '9:41 am' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5FA',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Hola',
            sentByUser: false,
          },
        ],
      },
    });

    await app.request('/whatsapp-contacts/Ana/marks/vip', { method: 'PUT' });
    const marked = await getJson<{ vip: unknown[]; everyoneElse: unknown[] }>(app, '/people');
    await app.request('/whatsapp-contacts/Ana/marks/vip', { method: 'DELETE' });
    const unmarked = await getJson<{ vip: unknown[]; everyoneElse: unknown[] }>(app, '/people');

    expect(marked.vip).toEqual([expect.objectContaining({ channel: 'whatsapp', displayName: 'Ana' })]);
    expect(marked.everyoneElse).toEqual([]);
    expect(unmarked.vip).toEqual([]);
  });

  it('stores the readable messages of a WhatsApp report and skips one whose time is not a date, instead of failing the report', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    const fromAna = (id: string, sentAt: string) => ({ id, sender: 'Ana', sentAt, text: 'Hola', sentByUser: false });

    const response = await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '9:41 am' }],
      openChat: {
        title: 'Ana',
        messages: [
          fromAna('3EB0A1B2C3D4E5FB', '-undefined-NaNTundefined'),
          fromAna('3EB0A1B2C3D4E5FC', '2026-11-10T09:41:00-06:00'),
        ],
      },
    });
    const { messages } = await getJson<{ messages: { messageId: string }[] }>(app, '/chat-messages');

    expect(response.status).toBe(200);
    expect(messages.map(({ messageId }) => messageId)).toEqual(['3EB0A1B2C3D4E5FC']);
  });

  it('stores a WhatsApp message time in UTC, as every other chat message is, so times from different channels order correctly', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '9:41 am' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F7',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Hola',
            sentByUser: false,
          },
        ],
      },
    });

    const { messages } = await getJson<{ messages: { time: string }[] }>(app, '/chat-messages');

    expect(messages.map(({ time }) => time)).toEqual(['2026-11-10T15:41:00.000Z']);
  });

  it('leaves out of GET /people a WhatsApp message the user sent, so the user is not listed as their own WhatsApp contact', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '2026-11-10T09:45:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
          {
            id: '3EB0F6E5D4C3B2A1',
            sender: 'You',
            sentAt: '2026-11-10T09:45:00-06:00',
            text: 'Tomorrow works.',
            sentByUser: true,
          },
        ],
      },
    });

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([
      expect.objectContaining({ channel: 'whatsapp', whatsappHandles: [{ name: 'Ana' }] }),
    ]);
  });
  it('lists at GET /people under VIP, after a backend restart on the same database file, a Telegram contact marked vip through PUT /telegram-contacts/:userId/marks/vip before it', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
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
  it('lists once under Urgent at GET /people, with the reason "VIP waiting" once, a Telegram contact marked vip with two messages waiting more than 1 business day in two chats', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-02T17:00:00.000Z');
    openChatMessageStore(databasePath).saveMessage({
      channel: 'telegram',
      chatId: '-9001',
      chatTitle: 'Board',
      messageId: '43',
      senderId: '7001',
      senderName: 'Lucía Romero',
      text: 'Francisco, can you share the deck here?',
      time: '2026-11-02T18:00:00.000Z',
      sentByUser: false,
    });
    const app = createApp({
      allowedEmails: [],
      databasePath,
      clock: { now: () => new Date('2026-11-04T19:00:00.000Z') },
    });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([
      expect.objectContaining({
        channel: 'telegram',
        telegramHandles: [{ userId: '7001' }],
        reasons: ['VIP waiting'],
      }),
    ]);
  });
  it('lists once under VIP at GET /people, with the time of their newest message, a Telegram contact marked vip with several messages', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    openChatMessageStore(databasePath).saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '43',
      senderId: '7001',
      senderName: 'Lucía Romero',
      text: 'Thursday at 10 works for me.',
      time: '2026-11-09T18:00:00.000Z',
      sentByUser: false,
    });
    const app = createApp({ allowedEmails: [], databasePath });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });

    const { vip } = await getJson<{ vip: unknown[] }>(app, '/people');

    expect(vip).toEqual([
      expect.objectContaining({ telegramHandles: [{ userId: '7001' }], lastMessageAt: '2026-11-09T18:00:00.000Z' }),
    ]);
  });
  it('leaves out of Urgent at GET /people a VIP Telegram contact the user has replied to in their chat since their message', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-02T17:00:00.000Z');
    openChatMessageStore(databasePath).saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '45',
      senderId: '5550000',
      senderName: 'Francisco Catalá',
      text: 'Thursday works, see you then.',
      time: '2026-11-02T18:00:00.000Z',
      sentByUser: true,
    });
    const app = createApp({
      allowedEmails: [],
      databasePath,
      clock: { now: () => new Date('2026-11-04T17:00:00.000Z') },
    });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([]);
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
  it('leaves out of VIP at GET /people a Telegram contact whose vip mark the user removed through DELETE /telegram-contacts/:userId/marks/vip', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const app = createApp({ allowedEmails: [], databasePath });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'PUT' });
    await app.request('/telegram-contacts/7001/marks/vip', { method: 'DELETE' });

    const { vip } = await getJson<{ vip: unknown[] }>(app, '/people');

    expect(vip).toEqual([]);
  });
  it("lists at GET /waiting-on, on channel telegram and waiting since its time, the sender of a Telegram chat whose newest message is not the user's", async () => {
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

  it("names at GET /waiting-on a Telegram sender's Telegram id, so the People tab can open that contact", async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const app = createApp({ allowedEmails: [], databasePath });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([expect.objectContaining({ telegramHandles: [{ userId: '7001' }] })]);
  });

  it('lists at GET /waiting-on, on channel whatsapp, the sender of a WhatsApp message the user has not answered', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 1, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([
      expect.objectContaining({ channel: 'whatsapp', displayName: 'Ana', waitingSince: '2026-11-10T15:41:00.000Z' }),
    ]);
  });

  it('leaves out of GET /waiting-on a WhatsApp chat whose last message, in the same minute, was sent by the user', async () => {
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath() });
    await postJson(app, '/chat-messages', {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
          {
            id: '3EB0F6E5D4C3B2A1',
            sender: 'Francisco',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Sure, same time.',
            sentByUser: true,
          },
        ],
      },
    });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([]);
  });

  it('lists at GET /waiting-on a Telegram sender who wrote twice without an answer once, waiting since the first message', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    openChatMessageStore(databasePath).saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '43',
      senderId: '7001',
      senderName: 'Lucía Romero',
      text: '[photo]',
      time: '2026-11-09T16:01:00.000Z',
      sentByUser: false,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([
      expect.objectContaining({ displayName: 'Lucía Romero', waitingSince: '2026-11-09T16:00:00.000Z' }),
    ]);
  });

  it("leaves out of GET /waiting-on a Telegram chat whose newest message is the user's", async () => {
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

  it('leaves out of GET /waiting-on a Telegram chat with a bot, though its newest message is from the bot', async () => {
    const databasePath = temporaryDatabasePath();
    openChatMessageStore(databasePath).saveMessage({
      ...bbvaAlertsBotMessage,
      messageId: '77',
      text: 'Cargo de $1,250.00 en tu tarjeta terminación 4321',
      time: '2026-11-09T16:00:00.000Z',
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

  it('reports at GET /now the time of the newest Telegram message someone else sent, not a later reply the user sent or a later message from another channel', async () => {
    const databasePath = temporaryDatabasePath();
    saveTelegramMessageFromLucia(databasePath, '2026-11-09T16:00:00.000Z');
    const chatMessageStore = openChatMessageStore(databasePath);
    chatMessageStore.saveMessage({
      channel: 'telegram',
      chatId: '7001',
      chatTitle: 'Lucía Romero',
      messageId: '43',
      senderId: '9000',
      senderName: 'Francisco',
      text: 'Thursday works.',
      time: '2026-11-09T16:30:00.000Z',
      sentByUser: true,
    });
    chatMessageStore.saveMessage({
      channel: 'whatsapp',
      chatId: '5215500000000',
      chatTitle: 'Marta',
      messageId: 'wa-1',
      senderId: '5215500000000',
      senderName: 'Marta',
      text: 'Are you around?',
      time: '2026-11-09T17:00:00.000Z',
      sentByUser: false,
    });
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
  it('does not report Telegram at GET /now as stale while the client has been disconnected for less than twice the 60 s check interval since it was last seen connected', async () => {
    const { telegramClient } = recordingTelegramClient();
    let currentTime = new Date('2026-11-10T06:15:00.000Z');
    let connected = true;
    const app = createApp({
      allowedEmails: [],
      databasePath: temporaryDatabasePath(),
      telegramClient: { ...telegramClient, isConnected: () => connected },
      clock: { now: () => currentTime },
    });
    currentTime = new Date('2026-11-10T06:20:00.000Z');
    await getJson<{ telegram: unknown }>(app, '/now');
    connected = false;
    currentTime = new Date('2026-11-10T06:21:00.000Z');

    const { telegram } = await getJson<{ telegram: unknown }>(app, '/now');

    expect(telegram).toEqual({ loggedIn: true, lastStartedAt: '2026-11-10T06:15:00.000Z' });
  });
});

describe('createApp Telegram start', () => {
  it('starts a Telegram client it is given: the recent messages of its unread dialogs, then every new message, are listed at GET /chat-messages', async () => {
    const unreadMessage = {
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
    const newMessage = {
      ...unreadMessage,
      messageId: '43',
      text: 'Or Friday morning?',
      time: '2026-11-09T16:05:00.000Z',
    };
    const telegramClient = createScriptedTelegramClient({
      dialogs: [{ chatId: '7001', chatTitle: 'Lucía Romero', unreadCount: 1, messages: [unreadMessage] }],
    });
    const app = createApp({ allowedEmails: [], databasePath: temporaryDatabasePath(), telegramClient });

    await vi.waitFor(async () => {
      const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');
      expect(messages).toEqual([unreadMessage]);
    });
    telegramClient.receive(newMessage);

    const { messages } = await getJson<{ messages: unknown[] }>(app, '/chat-messages');
    expect(messages).toEqual([unreadMessage, newMessage]);
  });
});
