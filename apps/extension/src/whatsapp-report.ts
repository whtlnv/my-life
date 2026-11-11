import { parseWhatsappChatList, parseWhatsappOpenChat } from './whatsapp-page-parser';

export const buildWhatsappReport = (document: Document) => ({
  channel: 'whatsapp' as const,
  chats: parseWhatsappChatList(document),
  openChat: { title: '', messages: parseWhatsappOpenChat(document) },
});
