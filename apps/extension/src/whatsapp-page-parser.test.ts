// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseWhatsappChatList, parseWhatsappOpenChat, parseWhatsappPage } from './whatsapp-page-parser';

const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');

describe('parseWhatsappChatList', () => {
  it('yields each chat in the saved chat list with its title, unread count and last message time', () => {
    const chats = parseWhatsappChatList(fixtureDocument('whatsapp-one-to-one-chat.fixture.html'));

    expect(chats).toEqual(
      [
        ['aaaaaa aaaaaaa', '0:00 aa'],
        ['a', '0:00 aa'],
        ['aaaaaaaaa aaaaaaa', '0:00 aa'],
        ['aaaaa aaaaaa', '0:00 aa'],
        ['aaaaaaaaa aaaaaaaaaaa aaaaaa', '0:00 aa'],
        ['aaaaaaaa aaaaa - aaaaaaaaaa', '0:00 aa'],
        ['aaaaaa, aaaaaa a aaaaaa', 'aaaaaaaaa'],
        ['aaa aaaa aaaaaa', 'aaaaaaaaa'],
        ['aaaa aa aaaaa a aaaaaa', 'aaaaaaaaa'],
        ['aaaaaaaaaaa aaaaaaa aa aaaaaa', 'aaaaaaaa'],
        ['aaaaa aaaaaaa aaaaaa', 'aaaaaaaa'],
        ['aaaaa aaaaaaaa aaaaaa', 'aaaaaaaa'],
      ].map(([title, lastMessageAt]) => ({ title, unreadCount: 0, lastMessageAt })),
    );
  });

  it("reads a row's unread count from the number its unread badge's label starts with, and 0 for a row with no badge", () => {
    const row = (title: string, badge: string): string =>
      `<div role="row"><div data-testid="cell-frame-title"><span title="${title}"></span></div>` +
      `<div data-testid="chat-list-timestamp">9:41 am</div>` +
      `<div data-testid="cell-frame-secondary"><div role="gridcell" aria-colindex="1"><span>${badge}</span></div></div></div>`;
    const document = new DOMParser().parseFromString(
      `<div id="pane-side">${row('Ana', '<span aria-label="12 unread messages"><span>12</span></span>')}${row('Luis', '')}</div>`,
      'text/html',
    );

    expect(parseWhatsappChatList(document).map(({ title, unreadCount }) => ({ title, unreadCount }))).toEqual([
      { title: 'Ana', unreadCount: 12 },
      { title: 'Luis', unreadCount: 0 },
    ]);
  });
});

describe('parseWhatsappOpenChat', () => {
  it("yields each rendered message's id and text from the saved open chat, skipping rows WhatsApp has not rendered", () => {
    const messages = parseWhatsappOpenChat(fixtureDocument('whatsapp-one-to-one-chat.fixture.html'));

    expect(messages.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: '3EB0F00000011667A1B2C3', text: '' },
      { id: '3EB0F00000013556A1B2C3', text: '' },
      { id: '3EB0F00000015445A1B2C3', text: 'aaaaa://aaaa.aaaaaa.aaa/aaaaaaaa/a/0aaaa0aa0aaaaa0aaaaaaaaaa0aa0aaaa/aaaa' },
      {
        id: '3EB0F00000017334A1B2C3',
        text: 'aaaa, aaaa!aaaaa aaaaa aaaa aaaaaaa aaaa aaaaaaa aa aa aaa aaaaaaaaaaa aa aaaaaaaa aaaa aaa aaaa aaaaa aa aaaaa aaaaa?',
      },
      { id: '3EB0F00000019223A1B2C3', text: 'aa aaa aaaaa aaa aaaaaaaa aaaa.' },
    ]);
  });

  it('marks as sent by the user exactly the messages whose meta holds a delivery-status icon, though their ids carry no direction prefix', () => {
    const messages = parseWhatsappOpenChat(fixtureDocument('whatsapp-group-chat.fixture.html'));

    expect(messages.filter(({ sentByUser }) => sentByUser).map(({ id }) => id)).toEqual([
      '3EB0F00000003DDEA1B2C3',
      '3EB0F0000000B99AA1B2C3',
      '3EB0F00000011667A1B2C3',
      '3EB0F00000013556A1B2C3',
      '3EB0F00000017334A1B2C3',
    ]);
  });

  it('marks as not sent by the user a message whose meta holds only its time and no delivery-status icon', () => {
    const document = new DOMParser().parseFromString(
      '<div id="main"><div data-id="3EB0F000000000AAA1B2C3"><div data-testid="msg-container">' +
        '<span data-testid="selectable-text">Hola</span>' +
        '<div data-testid="msg-meta"><span dir="auto"><span>9:41 pm</span></span></div></div></div></div>',
      'text/html',
    );

    expect(parseWhatsappOpenChat(document).map(({ id, sentByUser }) => ({ id, sentByUser }))).toEqual([
      { id: '3EB0F000000000AAA1B2C3', sentByUser: false },
    ]);
  });

  it("reads each message's sender and time from its pre-plain-text label, a 12-hour time and day/month/year in Mexico City, with an unsaved group member named by their phone number", () => {
    const row = (id: string, prePlainText: string): string =>
      `<div data-id="${id}"><div data-testid="msg-container"><div data-pre-plain-text="${prePlainText}">` +
      '<span data-testid="selectable-text">Hola</span></div></div></div>';
    const document = new DOMParser().parseFromString(
      `<div id="main">${row('3EB0F000000000AAA1B2C3', '[9:41 pm, 30/9/2026] Sam Rivera: ')}` +
        `${row('3EB0F000000000BBB1B2C3', '[8:05 am, 1/10/2026] +52 55 1234 0001: ')}</div>`,
      'text/html',
    );

    expect(parseWhatsappOpenChat(document).map(({ sender, sentAt }) => ({ sender, sentAt }))).toEqual([
      { sender: 'Sam Rivera', sentAt: '2026-09-30T21:41:00-06:00' },
      { sender: '+52 55 1234 0001', sentAt: '2026-10-01T08:05:00-06:00' },
    ]);
  });

  it('dates each message in the saved group chat on its own day, across the change from one day to the next', () => {
    const messages = parseWhatsappOpenChat(fixtureDocument('whatsapp-group-chat.fixture.html'));
    const sentAtOf = (id: string): string | undefined => messages.find((message) => message.id === id)?.sentAt;

    expect([sentAtOf('3EB0F0000000B99AA1B2C3'), sentAtOf('3EB0F0000000D889A1B2C3')]).toEqual([
      '2026-09-29T18:15:00-06:00',
      '2026-09-30T19:16:00-06:00',
    ]);
  });
});

describe('parseWhatsappPage', () => {
  it('succeeds with the chat list and no messages when no chat is open', () => {
    const document = new DOMParser().parseFromString(
      '<div id="pane-side"><div role="row"><div data-testid="cell-frame-title"><span title="Ana"></span></div>' +
        '<div data-testid="chat-list-timestamp">9:41 am</div></div></div>',
      'text/html',
    );

    expect(parseWhatsappPage(document)).toEqual({
      ok: true,
      chats: [{ title: 'Ana', unreadCount: 0, lastMessageAt: '9:41 am' }],
      messages: [],
    });
  });

  it('fails naming the message-row selector when the chat pane is present but holds no message rows', () => {
    const document = new DOMParser().parseFromString(
      '<div id="pane-side"><div role="row"><div data-testid="cell-frame-title"><span title="Ana"></span></div>' +
        '<div data-testid="chat-list-timestamp">9:41 am</div></div></div>' +
        '<div id="main"><div data-testid="conversation-panel-messages"></div></div>',
      'text/html',
    );

    expect(parseWhatsappPage(document)).toEqual({ ok: false, missingSelector: '#main [data-id]' });
  });
});
