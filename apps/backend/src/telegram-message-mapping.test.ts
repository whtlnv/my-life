import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { describe, expect, it } from 'vitest';

import { openChatMessageStore } from './chat-message-store';
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

  it.each([
    {
      peerWithout: 'no last name',
      displayedAs: 'their first name alone',
      peer: new Api.User({ id: returnBigInt(515151), firstName: 'Marta' }),
      expectedName: 'Marta',
    },
    {
      peerWithout: 'neither a first nor a last name',
      displayedAs: 'their username',
      peer: new Api.User({ id: returnBigInt(616161), username: 'ghost_courier' }),
      expectedName: 'ghost_courier',
    },
    {
      peerWithout: 'no first name, no last name and no username',
      displayedAs: 'their id',
      peer: new Api.User({ id: returnBigInt(717171) }),
      expectedName: '717171',
    },
  ])(
    'names a peer who has $peerWithout by $displayedAs, in both the chat title and the sender name',
    ({ peer, expectedName }) => {
      const message = new Api.Message({
        id: 1019,
        peerId: new Api.PeerUser({ userId: peer.id }),
        date: Date.parse('2026-11-09T17:00:00.000Z') / 1000,
        message: 'Te mando el contrato',
        out: false,
      });

      const mapped = mapTelegramMessage({ message, chat: peer, sender: peer });

      expect({ chatTitle: mapped?.chatTitle, senderName: mapped?.senderName }).toEqual({
        chatTitle: expectedName,
        senderName: expectedName,
      });
    },
  );

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
      chatId: '-909090',
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

  it('maps a photo sent with no text to a chat message whose text is [photo]', () => {
    const message = new Api.Message({
      id: 1023,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:12:00.000Z') / 1000,
      message: '',
      media: new Api.MessageMediaPhoto({ photo: new Api.PhotoEmpty({ id: returnBigInt(5550002) }) }),
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: luis })).toEqual(
      expect.objectContaining({ messageId: '1023', text: '[photo]' }),
    );
  });

  it('maps a video sent with no text to a chat message whose text is [video]', () => {
    const message = new Api.Message({
      id: 1024,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:14:00.000Z') / 1000,
      message: '',
      media: new Api.MessageMediaDocument({
        document: new Api.Document({
          id: returnBigInt(5560001),
          accessHash: returnBigInt(0),
          fileReference: Buffer.from(''),
          date: Date.parse('2026-11-09T19:14:00.000Z') / 1000,
          mimeType: 'video/mp4',
          size: returnBigInt(204800),
          dcId: 1,
          attributes: [new Api.DocumentAttributeVideo({ duration: 12, w: 1280, h: 720 })],
        }),
      }),
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: luis })).toEqual(
      expect.objectContaining({ messageId: '1024', text: '[video]' }),
    );
  });

  it('maps a voice note sent with no text to a chat message whose text is [voice note]', () => {
    const message = new Api.Message({
      id: 1025,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:20:00.000Z') / 1000,
      message: '',
      media: new Api.MessageMediaDocument({
        voice: true,
        document: new Api.Document({
          id: returnBigInt(5570001),
          accessHash: returnBigInt(0),
          fileReference: Buffer.from(''),
          date: Date.parse('2026-11-09T19:20:00.000Z') / 1000,
          mimeType: 'audio/ogg',
          size: returnBigInt(40960),
          dcId: 1,
          attributes: [new Api.DocumentAttributeAudio({ duration: 7, voice: true })],
        }),
      }),
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: luis })).toEqual(
      expect.objectContaining({ messageId: '1025', text: '[voice note]' }),
    );
  });

  it('maps an audio file that is not a voice note, sent with no text, to a chat message whose text is [audio]', () => {
    const message = new Api.Message({
      id: 1026,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:25:00.000Z') / 1000,
      message: '',
      media: new Api.MessageMediaDocument({
        document: new Api.Document({
          id: returnBigInt(5580001),
          accessHash: returnBigInt(0),
          fileReference: Buffer.from(''),
          date: Date.parse('2026-11-09T19:25:00.000Z') / 1000,
          mimeType: 'audio/mpeg',
          size: returnBigInt(3145728),
          dcId: 1,
          attributes: [
            new Api.DocumentAttributeAudio({ duration: 184, title: 'Demo mix', performer: 'Luis Ortega' }),
            new Api.DocumentAttributeFilename({ fileName: 'demo-mix.mp3' }),
          ],
        }),
      }),
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: luis })).toEqual(
      expect.objectContaining({ messageId: '1026', text: '[audio]' }),
    );
  });

  it('maps a document sent with no text to a chat message whose text is [document]', () => {
    const message = new Api.Message({
      id: 1027,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T19:30:00.000Z') / 1000,
      message: '',
      media: new Api.MessageMediaDocument({
        document: new Api.Document({
          id: returnBigInt(5590001),
          accessHash: returnBigInt(0),
          fileReference: Buffer.from(''),
          date: Date.parse('2026-11-09T19:30:00.000Z') / 1000,
          mimeType: 'application/pdf',
          size: returnBigInt(524288),
          dcId: 1,
          attributes: [new Api.DocumentAttributeFilename({ fileName: 'contract.pdf' })],
        }),
      }),
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: luis, sender: luis })).toEqual(
      expect.objectContaining({ messageId: '1027', text: '[document]' }),
    );
  });

  it("maps a message in a supergroup to a chat message whose chat id is the supergroup's -100 marked peer id", () => {
    const supergroup = new Api.Channel({
      id: returnBigInt(707070),
      title: 'Mutuus equipo',
      photo: new Api.ChatPhotoEmpty(),
      date: Date.parse('2026-01-01T00:00:00.000Z') / 1000,
      megagroup: true,
    });
    const message = new Api.Message({
      id: 4001,
      peerId: new Api.PeerChannel({ channelId: returnBigInt(707070) }),
      fromId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-09T21:00:00.000Z') / 1000,
      message: '¿Quién revisa el contrato?',
      out: false,
    });

    expect(mapTelegramMessage({ message, chat: supergroup, sender: luis })).toEqual(
      expect.objectContaining({ chatId: '-100707070', chatTitle: 'Mutuus equipo' }),
    );
  });

  it('stores a message from a chat with a bot user with the chat marked as a bot', () => {
    const bot = new Api.User({ id: returnBigInt(939393), firstName: 'BBVA Alertas', bot: true });
    const message = new Api.Message({
      id: 5001,
      peerId: new Api.PeerUser({ userId: returnBigInt(939393) }),
      date: Date.parse('2026-11-10T09:00:00.000Z') / 1000,
      message: 'Cargo por $1,250.00 en tu tarjeta',
      out: false,
    });
    const directory = mkdtempSync(join(tmpdir(), 'my-life-'));
    try {
      const store = openChatMessageStore(join(directory, 'my-life.sqlite'));
      const mapped = mapTelegramMessage({ message, chat: bot, sender: bot });
      if (mapped) store.saveMessage(mapped);

      expect(store.listMessages()).toEqual([expect.objectContaining({ chatId: '939393', chatIsBot: true })]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('stores a message from a chat with a person with the chat not marked as a bot', () => {
    const message = new Api.Message({
      id: 5002,
      peerId: new Api.PeerUser({ userId: returnBigInt(424242) }),
      date: Date.parse('2026-11-10T09:05:00.000Z') / 1000,
      message: '¿Nos vemos el jueves?',
      out: false,
    });
    const directory = mkdtempSync(join(tmpdir(), 'my-life-'));
    try {
      const store = openChatMessageStore(join(directory, 'my-life.sqlite'));
      const mapped = mapTelegramMessage({ message, chat: luis, sender: luis });
      if (mapped) store.saveMessage(mapped);

      expect(store.listMessages()).toEqual([expect.objectContaining({ chatId: '424242' })]);
      expect(store.listMessages()[0]).not.toHaveProperty('chatIsBot');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
