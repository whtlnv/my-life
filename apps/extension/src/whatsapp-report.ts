import { parseWhatsappChatList, parseWhatsappOpenChat } from './whatsapp-page-parser';

// The open chat is named by its conversation header, so its messages are stored under that chat.
const openChatTitleOf = (document: Document): string =>
  document.querySelector('#main [data-testid="conversation-info-header-chat-title"]')?.textContent.trim() ?? '';

export const buildWhatsappReport = (document: Document) => ({
  channel: 'whatsapp' as const,
  chats: parseWhatsappChatList(document),
  openChat: { title: openChatTitleOf(document), messages: parseWhatsappOpenChat(document) },
});
