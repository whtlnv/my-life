import { Api, utils } from 'telegram';

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

const mediaPlaceholders: Partial<Record<string, string>> = {
  MessageMediaPhoto: '[photo]',
  MessageMediaDocument: '[document]',
};

function isVideoDocument(media: Api.TypeMessageMedia): boolean {
  return (
    media instanceof Api.MessageMediaDocument &&
    media.document instanceof Api.Document &&
    media.document.attributes.some((attribute) => attribute instanceof Api.DocumentAttributeVideo)
  );
}

function isAudioDocument(media: Api.TypeMessageMedia): boolean {
  return (
    media instanceof Api.MessageMediaDocument &&
    media.document instanceof Api.Document &&
    media.document.attributes.some((attribute) => attribute instanceof Api.DocumentAttributeAudio)
  );
}

function mediaPlaceholder(media: Api.TypeMessageMedia): string | undefined {
  if (media instanceof Api.MessageMediaDocument && media.voice) {
    return '[voice note]';
  }
  if (isAudioDocument(media)) {
    return '[audio]';
  }
  if (isVideoDocument(media)) {
    return '[video]';
  }
  return mediaPlaceholders[media.className];
}

function messageText(message: Api.Message): string {
  if (message.message || !message.media) {
    return message.message;
  }
  return mediaPlaceholder(message.media) ?? message.message;
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
