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

const senderAndTimeOf = (row: Element): { sender: string; sentAt: string } => {
  const label = row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '';
  const [, hour = '', minute = '', meridiem = '', day = '', month = '', year = '', sender = ''] =
    /^\[(\d+):(\d+) (am|pm), (\d+)\/(\d+)\/(\d+)\] (.*): $/.exec(label) ?? [];
  const hour24 = (Number(hour) % 12) + (meridiem === 'pm' ? 12 : 0);
  return {
    sender,
    sentAt: `${year}-${twoDigits(Number(month))}-${twoDigits(Number(day))}T${twoDigits(hour24)}:${minute}:00-06:00`,
  };
};

export const parseWhatsappOpenChat = (document: Document): WhatsappOpenChatMessage[] =>
  [...document.querySelectorAll('#main [data-id]')]
    .filter((row) => row.querySelector('[data-testid="msg-container"]'))
    .map((row) => ({
      id: row.getAttribute('data-id') ?? '',
      text: row.querySelector('[data-testid="selectable-text"]')?.textContent ?? '',
      sentByUser: row.querySelector('[data-testid="msg-meta"] span[aria-label]') !== null,
      ...senderAndTimeOf(row),
    }));
