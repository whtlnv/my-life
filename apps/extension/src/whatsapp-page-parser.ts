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
}

export const parseWhatsappOpenChat = (document: Document): WhatsappOpenChatMessage[] =>
  [...document.querySelectorAll('#main [data-id]')]
    .filter((row) => row.querySelector('[data-testid="msg-container"]'))
    .map((row) => ({
      id: row.getAttribute('data-id') ?? '',
      text: row.querySelector('[data-testid="selectable-text"]')?.textContent ?? '',
      sentByUser: row.querySelector('[data-testid="msg-meta"] span[aria-label]') !== null,
    }));
