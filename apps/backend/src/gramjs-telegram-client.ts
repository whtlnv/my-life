import type { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';

import type { ChatMessage } from './chat-message-store';
import { mapTelegramMessage } from './telegram-message-mapping';

type TelegramChat = Api.User | Api.Chat | Api.Channel;

interface GramjsClient {
  sendMessage: (entity: ReturnType<typeof returnBigInt>, parameters: { message: string }) => Promise<{ id: number }>;
  getMe: () => Promise<{ id: { toString: () => string }; firstName: string; lastName: string }>;
  getDialogs: () => Promise<{ entity: TelegramChat; unreadCount: number }[]>;
  getMessages: (entity: TelegramChat) => Promise<Api.Message[]>;
  addEventHandler: (callback: (event: { message: Api.Message }) => unknown) => void;
}

interface GramjsTelegramClient {
  sendText: (chatId: string, text: string) => Promise<{ messageId: string }>;
  getOwnAccount: () => Promise<{ id: string; name: string }>;
  listDialogs: () => Promise<{ unreadCount: number; messages: ChatMessage[] }[]>;
  onMessage: (handler: (message: ChatMessage) => void) => void;
}

export function createGramjsTelegramClient(gramjsClient: GramjsClient): GramjsTelegramClient {
  return {
    sendText: async (chatId, text) => {
      const sent = await gramjsClient.sendMessage(returnBigInt(chatId), { message: text });
      return { messageId: String(sent.id) };
    },
    getOwnAccount: async () => {
      const me = await gramjsClient.getMe();
      return { id: me.id.toString(), name: `${me.firstName} ${me.lastName}` };
    },
    listDialogs: async () => {
      const dialogs = await gramjsClient.getDialogs();
      return Promise.all(
        dialogs.map(async ({ entity, unreadCount }) => {
          const messages = await gramjsClient.getMessages(entity);
          return {
            unreadCount,
            messages: messages.flatMap(
              (message) => mapTelegramMessage({ message, chat: entity, sender: message.sender as Api.User }) ?? [],
            ),
          };
        }),
      );
    },
    onMessage: (handler) => {
      gramjsClient.addEventHandler(({ message }) => {
        const mapped = mapTelegramMessage({
          message,
          chat: message.chat as TelegramChat,
          sender: message.sender as Api.User,
        });
        if (mapped) handler(mapped);
      });
    },
  };
}
