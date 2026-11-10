import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
});
