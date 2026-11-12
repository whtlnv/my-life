export interface WhatsappChatListEntry {
  title: string;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
}

const unreadCountOf = (row: Element): number =>
  [...row.querySelectorAll('[data-testid="cell-frame-secondary"] [aria-label]')]
    .map((badge) => Number.parseInt(badge.getAttribute('aria-label') ?? '', 10))
    .find((count) => !Number.isNaN(count)) ?? 0;

// WhatsApp wraps the title in left-to-right embedding marks (U+202A … U+202C).
const bidiMarkPattern = /[\u202a\u202c]/g;

const lastMessagePreviewOf = (row: Element): string =>
  (row.querySelector('[data-testid="last-msg-status"]')?.getAttribute('title') ?? '').replace(bidiMarkPattern, '');

const chatRowSelector = '#pane-side [role="row"]';

export const parseWhatsappChatList = (document: Document): WhatsappChatListEntry[] =>
  [...document.querySelectorAll(chatRowSelector)].map((row) => ({
    title: row.querySelector('[data-testid="cell-frame-title"] span[title]')?.getAttribute('title') ?? '',
    unreadCount: unreadCountOf(row),
    lastMessageAt: row.querySelector('[data-testid="chat-list-timestamp"]')?.textContent ?? '',
    lastMessagePreview: lastMessagePreviewOf(row),
  }));

export interface WhatsappOpenChatMessage {
  id: string;
  text: string;
  sentByUser: boolean;
  sender: string;
  sentAt: string;
}

const twoDigits = (value: number): string => String(value).padStart(2, '0');

// A clock time as WhatsApp writes it in any locale: `9:41 pm`, `9:41 PM`, `9:41 p.m.`, `9:41\u202fAM` or 24-hour `21:41`.
const clockTimePattern = /(\d{1,2}):(\d{2})(?:[\s\u202f]*([ap])\.?\s?m\.?)?/i;

const hour24Of = (hour: string, meridiem: string | undefined): number => {
  if (meridiem === undefined) return Number(hour);
  return (Number(hour) % 12) + (meridiem.toLowerCase() === 'p' ? 12 : 0);
};

// `9:41 pm` → `21:41:00-06:00`, the business time zone's offset; undefined when the text holds no clock time.
const clockTimeOf = (text: string): string | undefined => {
  const [, hour, minute, meridiem] = clockTimePattern.exec(text) ?? [];
  if (hour === undefined || minute === undefined) return undefined;
  return `${twoDigits(hour24Of(hour, meridiem))}:${minute}:00-06:00`;
};

// `[9:41 PM, 11/3/2026] Name: `: a clock time, then the date (month/day/year, or day/month/year), then the sender.
const prePlainTextPattern = /^\[([^,\]]+), (\d{1,2})\/(\d{1,2})\/(\d{4})\] (.*?):\s*$/;

const senderAndTimeOf = (row: Element): { sender: string; sentAt: string | undefined } => {
  const label = row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '';
  const [, time = '', first = '', second = '', year = '', sender = ''] = prePlainTextPattern.exec(label) ?? [];
  // The user's page writes month/day/year (11/3/2026 is November 3); a first number above 12 can only be a day.
  const [day, month] = Number(first) > 12 ? [first, second] : [second, first];
  const clockTime = clockTimeOf(time);
  return {
    sender,
    sentAt:
      clockTime === undefined
        ? undefined
        : `${year}-${twoDigits(Number(month))}-${twoDigits(Number(day))}T${clockTime}`,
  };
};

const mediaPlaceholders: readonly { testId: string; placeholder: string }[] = [
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

// A row without a pre-plain-text label (a sticker, a photo) shows only a time; its day is the previous message's.
const metaTimeOn = (row: Element, previousSentAt: string): string | undefined => {
  const clockTime = clockTimeOf(row.querySelector('[data-testid="msg-meta"]')?.textContent ?? '');
  return clockTime === undefined ? undefined : `${previousSentAt.slice(0, 10)}T${clockTime}`;
};

export const parseWhatsappOpenChat = (document: Document): WhatsappOpenChatMessage[] => {
  const rows = [...document.querySelectorAll(messageRowSelector)].filter(
    (row) => row.querySelector('[data-testid="msg-container"]') !== null,
  );
  const labelledTimes = rows.map((row) => senderAndTimeOf(row).sentAt);
  const messages: WhatsappOpenChatMessage[] = [];
  rows.forEach((row, index) => {
    const senderAndTime = senderAndTimeOf(row);
    // An unlabelled row (a sticker, a photo) takes its day from the nearest labelled row, earlier or else later.
    const neighbourTime = messages.at(-1)?.sentAt ?? labelledTimes.slice(index + 1).find((time) => time !== undefined);
    const sentAt =
      row.querySelector('[data-pre-plain-text]') === null && neighbourTime !== undefined
        ? metaTimeOn(row, neighbourTime)
        : senderAndTime.sentAt;
    // A row whose time cannot be read is left out rather than reported with an invalid time.
    if (sentAt === undefined) return;
    messages.push({
      id: row.getAttribute('data-id') ?? '',
      text: textOf(row),
      sentByUser: row.querySelector('[data-testid="msg-meta"] span[aria-label]') !== null,
      sender: senderAndTime.sender,
      sentAt,
    });
  });
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

// Each selector must match once the selector it depends on matches; the first one that does not names the failure.
const requiredSelectors: readonly { selector: string; whenPresent?: string }[] = [
  { selector: chatRowSelector },
  { selector: messageRowSelector, whenPresent: chatPaneSelector },
  { selector: prePlainTextSelector, whenPresent: messageRowSelector },
];

export const parseWhatsappPage = (document: Document): WhatsappPage | WhatsappPageFailure => {
  const present = (selector: string): boolean => document.querySelector(selector) !== null;
  const missing = requiredSelectors.find(
    ({ selector, whenPresent }) => (whenPresent === undefined || present(whenPresent)) && !present(selector),
  );
  if (missing !== undefined) {
    return { ok: false, missingSelector: missing.selector };
  }
  return { ok: true, chats: parseWhatsappChatList(document), messages: parseWhatsappOpenChat(document) };
};
