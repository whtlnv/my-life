import type { Api } from 'telegram';

import type { ChatMessage } from './chat-message-store';

function userName(user: Api.User): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return fullName || (user.username ?? user.id.toString());
}

export function mapTelegramMessage({
  message,
  chat,
  sender,
}: {
  message: Api.Message;
  chat: Api.User | Api.Chat;
  sender: Api.User;
}): ChatMessage {
  return {
    channel: 'telegram',
    chatId: chat.id.toString(),
    chatTitle: 'title' in chat ? chat.title : userName(chat),
    messageId: String(message.id),
    senderId: sender.id.toString(),
    senderName: userName(sender),
    text: message.message,
    time: new Date(message.date * 1000).toISOString(),
    sentByUser: Boolean(message.out),
  };
}
