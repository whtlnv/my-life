export interface WhatsappChatListEntry {
  title: string;
  unreadCount: number;
  lastMessageAt: string;
}

const unreadCountOf = (row: Element): number =>
  [...row.querySelectorAll('[data-testid="cell-frame-secondary"] [aria-label]')]
    .map((badge) => Number.parseInt(badge.getAttribute('aria-label') ?? '', 10))
    .find((count) => !Number.isNaN(count)) ?? 0;

const chatRowSelector = '#pane-side [role="row"]';

export const parseWhatsappChatList = (document: Document): WhatsappChatListEntry[] =>
  [...document.querySelectorAll(chatRowSelector)].map((row) => ({
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

const hour24Of = (hour: string, meridiem: string): number => (Number(hour) % 12) + (meridiem === 'pm' ? 12 : 0);

// `9:41 pm` → `21:41:00-06:00`, the business time zone's offset.
const clockTimeOf = (hour: string, minute: string, meridiem: string): string =>
  `${twoDigits(hour24Of(hour, meridiem))}:${minute}:00-06:00`;

// `[9:41 pm, 30/9/2026] Name: `: 12-hour time, day/month/year.
const prePlainTextPattern = /^\[(\d+):(\d+) (am|pm), (\d+)\/(\d+)\/(\d+)\] (.*): $/;

const senderAndTimeOf = (row: Element): { sender: string; sentAt: string } => {
  const label = row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '';
  const [, hour = '', minute = '', meridiem = '', day = '', month = '', year = '', sender = ''] =
    prePlainTextPattern.exec(label) ?? [];
  return {
    sender,
    sentAt: `${year}-${twoDigits(Number(month))}-${twoDigits(Number(day))}T${clockTimeOf(hour, minute, meridiem)}`,
  };
};

const mediaPlaceholders: ReadonlyArray<{ testId: string; placeholder: string }> = [
  { testId: 'sticker-container', placeholder: '[sticker]' },
  { testId: 'image-thumb', placeholder: '[photo]' },
];

const textOf = (row: Element): string => {
  const media = mediaPlaceholders.find(({ testId }) => row.querySelector(`[data-testid="${testId}"]`) !== null);
  if (media !== undefined) {
    return media.placeholder;
  }
  return row.querySelector('[data-testid="selectable-text"]')?.textContent ?? '';
};

const chatPaneSelector = '#main';
const messageRowSelector = `${chatPaneSelector} [data-id]`;
const prePlainTextSelector = `${messageRowSelector} [data-pre-plain-text]`;

const metaTimePattern = /^(\d+):(\d+) (am|pm)$/;

// A row without a pre-plain-text label (a sticker, a photo) shows only a time; its day is the previous message's.
const metaTimeOn = (row: Element, previousSentAt: string): string => {
  const [, hour = '', minute = '', meridiem = ''] =
    metaTimePattern.exec(row.querySelector('[data-testid="msg-meta"]')?.textContent ?? '') ?? [];
  return `${previousSentAt.slice(0, 10)}T${clockTimeOf(hour, minute, meridiem)}`;
};

export const parseWhatsappOpenChat = (document: Document): WhatsappOpenChatMessage[] => {
  const messages: WhatsappOpenChatMessage[] = [];
  for (const row of document.querySelectorAll(messageRowSelector)) {
    if (!row.querySelector('[data-testid="msg-container"]')) {
      continue;
    }
    const senderAndTime = senderAndTimeOf(row);
    const previous = messages.at(-1);
    if (row.querySelector('[data-pre-plain-text]') === null && previous !== undefined) {
      senderAndTime.sentAt = metaTimeOn(row, previous.sentAt);
    }
    messages.push({
      id: row.getAttribute('data-id') ?? '',
      text: textOf(row),
      sentByUser: row.querySelector('[data-testid="msg-meta"] span[aria-label]') !== null,
      ...senderAndTime,
    });
  }
  return messages;
};

export interface WhatsappPage {
  ok: true;
  chats: WhatsappChatListEntry[];
  messages: WhatsappOpenChatMessage[];
}

export interface WhatsappPageFailure {
  ok: false;
  missingSelector: string;
}

export const parseWhatsappPage = (document: Document): WhatsappPage | WhatsappPageFailure => {
  if (document.querySelector(chatRowSelector) === null) {
    return { ok: false, missingSelector: chatRowSelector };
  }
  if (document.querySelector(chatPaneSelector) !== null && document.querySelector(messageRowSelector) === null) {
    return { ok: false, missingSelector: messageRowSelector };
  }
  if (document.querySelector(messageRowSelector) !== null && document.querySelector(prePlainTextSelector) === null) {
    return { ok: false, missingSelector: prePlainTextSelector };
  }
  return { ok: true, chats: parseWhatsappChatList(document), messages: parseWhatsappOpenChat(document) };
};
