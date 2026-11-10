import { utils, type Api } from 'telegram';

import type { ChatMessage } from './chat-message-store';

export type TelegramChat = Api.User | Api.Chat | Api.Channel;

export function userName(user: Api.User): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return fullName || (user.username ?? user.id.toString());
}

function isBroadcastChannel(chat: TelegramChat): boolean {
  return 'broadcast' in chat && chat.broadcast;
}

interface TelegramMessageContext {
  message: Api.Message | Api.MessageService;
  chat: TelegramChat;
  sender: Api.User;
}

export function mapTelegramMessage({ message, chat, sender }: TelegramMessageContext): ChatMessage | undefined {
  if (message.className === 'MessageService' || isBroadcastChannel(chat) || !message.message) {
    return undefined;
  }
  return {
    channel: 'telegram',
    chatId: utils.getPeerId(chat),
    chatTitle: 'title' in chat ? chat.title : userName(chat),
    messageId: String(message.id),
    senderId: sender.id.toString(),
    senderName: userName(sender),
    text: message.message,
    time: new Date(message.date * 1000).toISOString(),
    sentByUser: Boolean(message.out),
  };
}
