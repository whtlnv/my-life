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

  it('maps an outgoing text message the user wrote to a chat message sent by the user, still titled after the peer', () => {
    const user = new Api.User({ id: returnBigInt(777001), firstName: 'Francisco', lastName: 'Catalá', self: true });
    const message = new Api.Message({
      id: 1018,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T16:32:00.000Z') / 1000,
      message: 'Sí, el jueves a las 10',
      out: true,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: user })).toEqual({
      channel: 'telegram',
      chatId: '424242',
      chatTitle: 'Luis Ortega',
      messageId: '1018',
      senderId: '777001',
      senderName: 'Francisco Catalá',
      text: 'Sí, el jueves a las 10',
      time: '2026-11-09T16:32:00.000Z',
      sentByUser: true,
    });
  });

  it('names a peer who has no last name by their first name alone, in both the chat title and the sender name', () => {
    const marta = new Api.User({ id: returnBigInt(515151), firstName: 'Marta' });
    const message = new Api.Message({
      id: 1019,
      peerId: new Api.PeerUser({ userId: returnBigInt(515151) }),
      date: Date.parse('2026-11-09T17:00:00.000Z') / 1000,
      message: 'Te mando el contrato',
      out: false,
    });

    const mapped = mapTelegramMessage({ message, chat: marta, sender: marta });

    expect({ chatTitle: mapped?.chatTitle, senderName: mapped?.senderName }).toEqual({
      chatTitle: 'Marta',
      senderName: 'Marta',
    });
  });

  it('names a peer who has neither a first nor a last name by their username, in both the chat title and the sender name', () => {
    const ghost = new Api.User({ id: returnBigInt(616161), username: 'ghost_courier' });
    const message = new Api.Message({
      id: 1020,
      peerId: new Api.PeerUser({ userId: returnBigInt(616161) }),
      date: Date.parse('2026-11-09T18:00:00.000Z') / 1000,
      message: 'Paquete entregado',
      out: false,
    });

    const mapped = mapTelegramMessage({ message, chat: ghost, sender: ghost });

    expect({ chatTitle: mapped?.chatTitle, senderName: mapped?.senderName }).toEqual({
      chatTitle: 'ghost_courier',
      senderName: 'ghost_courier',
    });
  });

  it('names a peer who has no first name, no last name and no username by their id, in both the chat title and the sender name', () => {
    const nameless = new Api.User({ id: returnBigInt(717171) });
    const message = new Api.Message({
      id: 1021,
      peerId: new Api.PeerUser({ userId: returnBigInt(717171) }),
      date: Date.parse('2026-11-09T18:30:00.000Z') / 1000,
      message: 'Hola',
      out: false,
    });

    const mapped = mapTelegramMessage({ message, chat: nameless, sender: nameless });

    expect({ chatTitle: mapped?.chatTitle, senderName: mapped?.senderName }).toEqual({
      chatTitle: '717171',
      senderName: '717171',
    });
  });

  it('maps a text message in a group to a chat message titled after the group and sent by the member who wrote it', () => {
    const group = new Api.Chat({
      id: returnBigInt(909090),
      title: 'Erlia socios',
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 3,
      date: Date.parse('2026-01-01T00:00:00.000Z') / 1000,
      version: 1,
    });
    const message = new Api.Message({
      id: 2001,
      peerId: new Api.PeerChat({ chatId: returnBigInt(909090) }),
      fromId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:00:00.000Z') / 1000,
      message: 'Revisen el deck antes del viernes',
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: group, sender: luis })).toEqual({
      channel: 'telegram',
      chatId: '909090',
      chatTitle: 'Erlia socios',
      messageId: '2001',
      senderId: '424242',
      senderName: 'Luis Ortega',
      text: 'Revisen el deck antes del viernes',
      time: '2026-11-09T19:00:00.000Z',
      sentByUser: false,
    });
  });

  it('drops a post in a broadcast channel, so the mapping returns nothing for it', () => {
    const channel = new Api.Channel({
      id: returnBigInt(808080),
      title: 'Noticias fintech',
      photo: new Api.ChatPhotoEmpty(),
      date: Date.parse('2026-01-01T00:00:00.000Z') / 1000,
      broadcast: true,
    });
    const message = new Api.Message({
      id: 3001,
      peerId: new Api.PeerChannel({ channelId: returnBigInt(808080) }),
      date: Date.parse('2026-11-09T20:00:00.000Z') / 1000,
      message: 'Nueva regulación de la CNBV',
      out: false,
      post: true,
    });

    expect(mapTelegramMessage({ message, chat: channel, sender: luis })).toBeUndefined();
  });

  it('drops a service message in a group, such as a member joining, so the mapping returns nothing for it', () => {
    const group = new Api.Chat({
      id: returnBigInt(909090),
      title: 'Erlia socios',
      photo: new Api.ChatPhotoEmpty(),
      participantsCount: 4,
      date: Date.parse('2026-01-01T00:00:00.000Z') / 1000,
      version: 2,
    });
    const message = new Api.MessageService({
      id: 2002,
      peerId: new Api.PeerChat({ chatId: returnBigInt(909090) }),
      fromId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:05:00.000Z') / 1000,
      action: new Api.MessageActionChatAddUser({ users: [returnBigInt(424242)] }),
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: group, sender: luis })).toBeUndefined();
  });

  it('drops a message with no text, such as a photo sent alone, so the mapping returns nothing for it', () => {
    const message = new Api.Message({
      id: 1022,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:10:00.000Z') / 1000,
      message: '',
      media: new Api.MessageMediaPhoto({ photo: new Api.PhotoEmpty({ id: returnBigInt(5550001) }) }),
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: luis })).toBeUndefined();
  });
});
