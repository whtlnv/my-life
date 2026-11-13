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
  sender: Api.User | Api.Channel;
}

const mediaPlaceholders: Partial<Record<string, string>> = {
  MessageMediaPhoto: '[photo]',
  MessageMediaDocument: '[document]',
};

type DocumentAttributeType = abstract new (...args: never[]) => Api.TypeDocumentAttribute;

function hasDocumentAttribute(media: Api.TypeMessageMedia, attributeType: DocumentAttributeType): boolean {
  return (
    media instanceof Api.MessageMediaDocument &&
    media.document instanceof Api.Document &&
    media.document.attributes.some((attribute) => attribute instanceof attributeType)
  );
}

const documentAttributePlaceholders: [DocumentAttributeType, string][] = [
  [Api.DocumentAttributeSticker, '[sticker]'],
  [Api.DocumentAttributeAudio, '[audio]'],
  [Api.DocumentAttributeVideo, '[video]'],
];

function mediaPlaceholder(media: Api.TypeMessageMedia): string | undefined {
  if (media instanceof Api.MessageMediaDocument && media.voice) {
    return '[voice note]';
  }
  const documentPlaceholder = documentAttributePlaceholders.find(([attributeType]) =>
    hasDocumentAttribute(media, attributeType),
  );
  return documentPlaceholder?.[1] ?? mediaPlaceholders[media.className];
}

function messageText(message: Api.Message): string {
  const placeholder = message.media && mediaPlaceholder(message.media);
  return [placeholder, message.message].filter(Boolean).join(' ');
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
    senderName: 'title' in sender ? sender.title : userName(sender),
    text,
    time: new Date(message.date * 1000).toISOString(),
    sentByUser: Boolean(message.out),
    ...('bot' in chat && chat.bot && { chatIsBot: true }),
  };
}
