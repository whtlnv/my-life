import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openChatMessageStore } from './chat-message-store';

const temporaryDatabasePath = () => join(mkdtempSync(join(tmpdir(), 'my-life-')), 'my-life.sqlite');

describe('chat message store', () => {
  it('lists a saved Telegram message back with its channel, chat, message id, sender, text, time and whether the user sent it', () => {
    const store = openChatMessageStore(temporaryDatabasePath());
    const message = {
      channel: 'telegram',
      chatId: '424242',
      chatTitle: 'Luis Ortega',
      messageId: '1017',
      senderId: '424242',
      senderName: 'Luis Ortega',
      text: '¿Nos vemos el jueves?',
      time: '2026-11-09T16:30:00.000Z',
      sentByUser: false,
    };

    store.saveMessage(message);

    expect(store.listMessages()).toEqual([message]);
  });

  it('lists a message saved twice with the same channel, chat id and message id once', () => {
    const databasePath = temporaryDatabasePath();
    try {
      const store = openChatMessageStore(databasePath);
      const message = {
        channel: 'telegram',
        chatId: '424242',
        chatTitle: 'Luis Ortega',
        messageId: '1017',
        senderId: '424242',
        senderName: 'Luis Ortega',
        text: '¿Nos vemos el jueves?',
        time: '2026-11-09T16:30:00.000Z',
        sentByUser: false,
      };

      store.saveMessage(message);
      store.saveMessage(message);

      expect(store.listMessages()).toEqual([message]);
    } finally {
      rmSync(dirname(databasePath), { recursive: true, force: true });
    }
  });

  it('lists two messages with the same chat id and message id but different channels both', () => {
    const databasePath = temporaryDatabasePath();
    try {
      const store = openChatMessageStore(databasePath);
      const telegramMessage = {
        channel: 'telegram',
        chatId: '424242',
        chatTitle: 'Luis Ortega',
        messageId: '1017',
        senderId: '424242',
        senderName: 'Luis Ortega',
        text: '¿Nos vemos el jueves?',
        time: '2026-11-09T16:30:00.000Z',
        sentByUser: false,
      };
      const whatsappMessage = { ...telegramMessage, channel: 'whatsapp' };

      store.saveMessage(telegramMessage);
      store.saveMessage(whatsappMessage);

      expect(store.listMessages()).toEqual([telegramMessage, whatsappMessage]);
    } finally {
      rmSync(dirname(databasePath), { recursive: true, force: true });
    }
  });

  it('lists chat messages saved before the store is reopened on the same database', () => {
    const databasePath = temporaryDatabasePath();
    try {
      const message = {
        channel: 'telegram',
        chatId: '424242',
        chatTitle: 'Luis Ortega',
        messageId: '1017',
        senderId: '424242',
        senderName: 'Luis Ortega',
        text: '¿Nos vemos el jueves?',
        time: '2026-11-09T16:30:00.000Z',
        sentByUser: false,
      };
      openChatMessageStore(databasePath).saveMessage(message);

      const reopened = openChatMessageStore(databasePath);

      expect(reopened.listMessages()).toEqual([message]);
    } finally {
      rmSync(dirname(databasePath), { recursive: true, force: true });
    }
  });

  it('lists ignore and task verdicts on chat messages saved before the store is reopened', () => {
    const databasePath = temporaryDatabasePath();
    try {
      const ignoreVerdict = { channel: 'telegram', chatId: '424242', messageId: '1017', decision: 'ignore' };
      const taskVerdict = { channel: 'telegram', chatId: '515151', messageId: '2044', decision: 'task' };
      const store = openChatMessageStore(databasePath);
      store.saveVerdict(ignoreVerdict);
      store.saveVerdict(taskVerdict);

      const reopened = openChatMessageStore(databasePath);

      expect(reopened.listVerdicts()).toEqual([ignoreVerdict, taskVerdict]);
    } finally {
      rmSync(dirname(databasePath), { recursive: true, force: true });
    }
  });
});
