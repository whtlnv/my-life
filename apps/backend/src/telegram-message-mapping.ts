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

function messageText(message: Api.Message): string {
  if (message.message) {
    return message.message;
  }
  if (message.media?.className === 'MessageMediaPhoto') {
    return '[photo]';
  }
  if (message.media?.className === 'MessageMediaDocument') {
    return '[video]';
  }
  return message.message;
}

export function mapTelegramMessage({ message, chat, sender }: TelegramMessageContext): ChatMessage | undefined {
  if (message.className === 'MessageService' || isBroadcastChannel(chat)) {
    return undefined;
  }
  const text = messageText(message);
  if (!text) {
    return undefined;
  }
  return {
    channel: 'telegram',
    chatId: utils.getPeerId(chat),
    chatTitle: 'title' in chat ? chat.title : userName(chat),
    messageId: String(message.id),
    senderId: sender.id.toString(),
    senderName: userName(sender),
    text,
    time: new Date(message.date * 1000).toISOString(),
    sentByUser: Boolean(message.out),
    ...('bot' in chat && chat.bot && { chatIsBot: true }),
  };
}
