import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type ChatMessage, openChatMessageStore } from './chat-message-store';
import { createScriptedTelegramClient } from './scripted-telegram-client';
import { startTelegram } from './start-telegram';

const temporaryDatabasePath = () => join(mkdtempSync(join(tmpdir(), 'my-life-')), 'my-life.sqlite');

const questionFromAna: ChatMessage = {
  channel: 'telegram',
  chatId: '42',
  chatTitle: 'Ana López',
  messageId: '7',
  senderId: '42',
  senderName: 'Ana López',
  text: 'Can you send the contract today?',
  time: '2026-11-09T15:00:00.000Z',
  sentByUser: false,
};

const questionInLaunchGroup: ChatMessage = {
  channel: 'telegram',
  chatId: '-1001',
  chatTitle: 'Launch team',
  messageId: '31',
  senderId: '77',
  senderName: 'Luis Ortega',
  text: 'Francisco, are we still on for Thursday?',
  time: '2026-11-09T16:30:00.000Z',
  sentByUser: false,
};

describe('startTelegram', () => {
  it('stores the recent messages of each dialog with unread messages', async () => {
    const databasePath = temporaryDatabasePath();
    try {
      const store = openChatMessageStore(databasePath);
      const client = createScriptedTelegramClient({
        dialogs: [
          { chatId: '42', chatTitle: 'Ana López', unreadCount: 1, messages: [questionFromAna] },
          { chatId: '-1001', chatTitle: 'Launch team', unreadCount: 1, messages: [questionInLaunchGroup] },
        ],
      });

      await startTelegram({ client, store });

      expect(store.listMessages()).toEqual([questionFromAna, questionInLaunchGroup]);
    } finally {
      rmSync(dirname(databasePath), { recursive: true, force: true });
    }
  });

  it('does not read a dialog with no unread messages', async () => {
    const databasePath = temporaryDatabasePath();
    try {
      const store = openChatMessageStore(databasePath);
      const client = createScriptedTelegramClient({
        dialogs: [
          { chatId: '42', chatTitle: 'Ana López', unreadCount: 1, messages: [questionFromAna] },
          { chatId: '-1001', chatTitle: 'Launch team', unreadCount: 0, messages: [questionInLaunchGroup] },
        ],
      });

      await startTelegram({ client, store });

      expect(store.listMessages()).toEqual([questionFromAna]);
    } finally {
      rmSync(dirname(databasePath), { recursive: true, force: true });
    }
  });
});
