export interface WhatsappChatListEntry {
  title: string;
  unreadCount: number;
  lastMessageAt: string;
}

export const parseWhatsappChatList = (document: Document): WhatsappChatListEntry[] =>
  [...document.querySelectorAll('#pane-side [role="row"]')].map((row) => ({
    title: row.querySelector('[data-testid="cell-frame-title"] span[title]')?.getAttribute('title') ?? '',
    unreadCount: 0,
    lastMessageAt: row.querySelector('[data-testid="chat-list-timestamp"]')?.textContent ?? '',
  }));
