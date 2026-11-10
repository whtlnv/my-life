import { describe, expect, it } from 'vitest';

import type { ChatMessage } from './chat-message-store';
import { createScriptedTelegramClient } from './scripted-telegram-client';

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

describe('createScriptedTelegramClient', () => {
  it('accepts a send to a chat it knows and returns a new message id', async () => {
    const client = createScriptedTelegramClient({
      dialogs: [{ chatId: '42', chatTitle: 'Ana López', unreadCount: 1, messages: [questionFromAna] }],
    });

    const sent = await client.sendText('42', 'Sending it now');

    expect(sent.messageId).toEqual(expect.any(String));
    expect(sent.messageId).not.toBe(questionFromAna.messageId);
  });

  it('refuses a send to a chat it does not know', async () => {
    const client = createScriptedTelegramClient({
      dialogs: [{ chatId: '42', chatTitle: 'Ana López', unreadCount: 1, messages: [questionFromAna] }],
    });

    await expect(client.sendText('99', 'Hello?')).rejects.toThrow();
  });

  it('refuses a send with empty text', async () => {
    const client = createScriptedTelegramClient({
      dialogs: [{ chatId: '42', chatTitle: 'Ana López', unreadCount: 1, messages: [questionFromAna] }],
    });

    await expect(client.sendText('42', '')).rejects.toThrow();
  });

  it('returns a different message id for each send, as Telegram does', async () => {
    const client = createScriptedTelegramClient({
      dialogs: [{ chatId: '42', chatTitle: 'Ana López', unreadCount: 1, messages: [questionFromAna] }],
    });

    const first = await client.sendText('42', 'On my way');
    const second = await client.sendText('42', 'Five minutes');

    expect(second.messageId).not.toBe(first.messageId);
  });
});
