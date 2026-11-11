export interface WhatsappChatListEntry {
  title: string;
  unreadCount: number;
  lastMessageAt: string;
}

const unreadCountOf = (row: Element): number =>
  [...row.querySelectorAll('[data-testid="cell-frame-secondary"] [aria-label]')]
    .map((badge) => Number.parseInt(badge.getAttribute('aria-label') ?? '', 10))
    .find((count) => !Number.isNaN(count)) ?? 0;

export const parseWhatsappChatList = (document: Document): WhatsappChatListEntry[] =>
  [...document.querySelectorAll('#pane-side [role="row"]')].map((row) => ({
    title: row.querySelector('[data-testid="cell-frame-title"] span[title]')?.getAttribute('title') ?? '',
    unreadCount: unreadCountOf(row),
    lastMessageAt: row.querySelector('[data-testid="chat-list-timestamp"]')?.textContent ?? '',
  }));

export interface WhatsappOpenChatMessage {
  id: string;
  text: string;
  sentByUser: boolean;
  sender: string;
  sentAt: string;
}

const twoDigits = (value: number): string => String(value).padStart(2, '0');

// `[9:41 pm, 30/9/2026] Name: `: 12-hour time, day/month/year.
const prePlainTextPattern = /^\[(\d+):(\d+) (am|pm), (\d+)\/(\d+)\/(\d+)\] (.*): $/;

const senderAndTimeOf = (row: Element): { sender: string; sentAt: string } => {
  const label = row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '';
  const [, hour = '', minute = '', meridiem = '', day = '', month = '', year = '', sender = ''] =
    prePlainTextPattern.exec(label) ?? [];
  const hour24 = (Number(hour) % 12) + (meridiem === 'pm' ? 12 : 0);
  return {
    sender,
    sentAt: `${year}-${twoDigits(Number(month))}-${twoDigits(Number(day))}T${twoDigits(hour24)}:${minute}:00-06:00`,
  };
};

const messageRowSelector = '#main [data-id]';

export const parseWhatsappOpenChat = (document: Document): WhatsappOpenChatMessage[] =>
  [...document.querySelectorAll(messageRowSelector)]
    .filter((row) => row.querySelector('[data-testid="msg-container"]'))
    .map((row) => ({
      id: row.getAttribute('data-id') ?? '',
      text: row.querySelector('[data-testid="selectable-text"]')?.textContent ?? '',
      sentByUser: row.querySelector('[data-testid="msg-meta"] span[aria-label]') !== null,
      ...senderAndTimeOf(row),
    }));

export interface WhatsappPage {
  ok: true;
  chats: WhatsappChatListEntry[];
  messages: WhatsappOpenChatMessage[];
}

export interface WhatsappPageFailure {
  ok: false;
  missingSelector: string;
}

export const parseWhatsappPage = (document: Document): WhatsappPage | WhatsappPageFailure =>
  document.querySelector('#main') !== null && document.querySelector(messageRowSelector) === null
    ? { ok: false, missingSelector: messageRowSelector }
    : { ok: true, chats: parseWhatsappChatList(document), messages: parseWhatsappOpenChat(document) };
