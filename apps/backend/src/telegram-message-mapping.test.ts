import { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { describe, expect, it } from 'vitest';

import { mapTelegramMessage } from './telegram-message-mapping';

const luis = new Api.User({ id: returnBigInt(424242), firstName: 'Luis', lastName: 'Ortega' });

describe('Telegram message mapping', () => {
  it('maps an incoming text message in a private chat to a telegram chat message from the peer, not sent by the user', () => {
    const message = new Api.Message({
      id: 1017,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T16:30:00.000Z') / 1000,
      message: '¿Nos vemos el jueves?',
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: luis })).toEqual({
      channel: 'telegram',
      chatId: '424242',
      chatTitle: 'Luis Ortega',
      messageId: '1017',
      senderId: '424242',
      senderName: 'Luis Ortega',
      text: '¿Nos vemos el jueves?',
      time: '2026-11-09T16:30:00.000Z',
      sentByUser: false,
    });
  });
});
