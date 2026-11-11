import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { openChatMessageStore } from './chat-message-store';

const temporaryDatabasePath = () => join(mkdtempSync(join(tmpdir(), 'my-life-')), 'my-life.sqlite');

const withTemporaryDatabase = (run: (databasePath: string) => void) => {
  const databasePath = temporaryDatabasePath();
  try {
    run(databasePath);
  } finally {
    rmSync(dirname(databasePath), { recursive: true, force: true });
  }
};

const telegramMessageFromLuis = {
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

describe('chat message store', () => {
  it('lists a saved Telegram message back with its channel, chat, message id, sender, text, time and whether the user sent it', () => {
    withTemporaryDatabase((databasePath) => {
      const store = openChatMessageStore(databasePath);
      const message = telegramMessageFromLuis;

      store.saveMessage(message);

      expect(store.listMessages()).toEqual([message]);
    });
  });

  it('lists messages oldest first even when they were saved newest first, as gramjs hands them over', () => {
    const store = openChatMessageStore(':memory:');
    const newer = { ...telegramMessageFromLuis, messageId: '1018', time: '2026-11-09T17:00:00.000Z' };

    store.saveMessage(newer);
    store.saveMessage(telegramMessageFromLuis);

    expect(store.listMessages().map(({ messageId }) => messageId)).toEqual(['1017', '1018']);
  });

  it('lists a message saved twice with the same channel, chat id and message id once', () => {
    withTemporaryDatabase((databasePath) => {
      const store = openChatMessageStore(databasePath);
      const message = telegramMessageFromLuis;

      store.saveMessage(message);
      store.saveMessage(message);

      expect(store.listMessages()).toEqual([message]);
    });
  });

  it('marks a stored message as from a bot chat when it is saved again with the bot mark, as the backend does for messages stored before the mark existed', () => {
    const store = openChatMessageStore(':memory:');
    store.saveMessage(telegramMessageFromLuis);

    store.saveMessage({ ...telegramMessageFromLuis, chatIsBot: true });

    expect(store.listMessages()).toEqual([{ ...telegramMessageFromLuis, chatIsBot: true }]);
  });

  it('lists two messages with the same chat id and message id but different channels both', () => {
    withTemporaryDatabase((databasePath) => {
      const store = openChatMessageStore(databasePath);
      const telegramMessage = telegramMessageFromLuis;
      const whatsappMessage = { ...telegramMessage, channel: 'whatsapp' };

      store.saveMessage(telegramMessage);
      store.saveMessage(whatsappMessage);

      expect(store.listMessages()).toEqual([telegramMessage, whatsappMessage]);
    });
  });

  it('lists chat messages saved before the store is reopened on the same database', () => {
    withTemporaryDatabase((databasePath) => {
      const message = telegramMessageFromLuis;
      openChatMessageStore(databasePath).saveMessage(message);

      const reopened = openChatMessageStore(databasePath);

      expect(reopened.listMessages()).toEqual([message]);
    });
  });

  it('lists ignore and task verdicts on chat messages saved before the store is reopened', () => {
    withTemporaryDatabase((databasePath) => {
      const ignoreVerdict = { channel: 'telegram', chatId: '424242', messageId: '1017', decision: 'ignore' };
      const taskVerdict = { channel: 'telegram', chatId: '515151', messageId: '2044', decision: 'task' };
      const store = openChatMessageStore(databasePath);
      store.saveVerdict(ignoreVerdict);
      store.saveVerdict(taskVerdict);

      const reopened = openChatMessageStore(databasePath);

      expect(reopened.listVerdicts()).toEqual([ignoreVerdict, taskVerdict]);
    });
  });

  it('lists a second verdict on the same chat message beside the first, not in its place', () => {
    withTemporaryDatabase((databasePath) => {
      const firstVerdict = { channel: 'telegram', chatId: '424242', messageId: '1017', decision: 'ignore' };
      const secondVerdict = { channel: 'telegram', chatId: '424242', messageId: '1017', decision: 'task' };
      const store = openChatMessageStore(databasePath);

      store.saveVerdict(firstVerdict);
      store.saveVerdict(secondVerdict);

      expect(store.listVerdicts()).toEqual([firstVerdict, secondVerdict]);
    });
  });
  it('saves and lists a bot chat message on a database whose chat_messages table was created before chats were marked as bots', () => {
    withTemporaryDatabase((databasePath) => {
      const before = new Database(databasePath);
      before.exec(
        `CREATE TABLE chat_messages (
          channel TEXT NOT NULL, chat_id TEXT NOT NULL, chat_title TEXT NOT NULL, message_id TEXT NOT NULL,
          sender_id TEXT NOT NULL, sender_name TEXT NOT NULL, text TEXT NOT NULL, time TEXT NOT NULL,
          sent_by_user INTEGER NOT NULL, PRIMARY KEY (channel, chat_id, message_id))`,
      );
      before.close();
      const store = openChatMessageStore(databasePath);
      const botMessage = { ...telegramMessageFromLuis, chatIsBot: true };

      store.saveMessage(botMessage);

      expect(store.listMessages()).toEqual([botMessage]);
    });
  });
});
