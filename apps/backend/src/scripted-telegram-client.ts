import type { ChatMessage } from './chat-message-store';

interface ScriptedDialog {
  chatId: string;
  chatTitle: string;
  unreadCount: number;
  messages: ChatMessage[];
}

interface TelegramScript {
  dialogs: ScriptedDialog[];
}

type MessageHandler = (message: ChatMessage) => void;

interface ScriptedTelegramClient {
  listDialogs: () => Promise<ScriptedDialog[]>;
  sendText: (chatId: string, text: string) => Promise<{ messageId: string }>;
  onMessage: (handler: MessageHandler) => void;
  receive: (message: ChatMessage) => void;
}

export function createScriptedTelegramClient(script: TelegramScript): ScriptedTelegramClient {
  const handlers: MessageHandler[] = [];
  return {
    onMessage: (handler) => handlers.push(handler),
    receive: (message) => handlers.forEach((handler) => handler(message)),
    listDialogs: () => Promise.resolve(script.dialogs),
    sendText: (chatId, text) => {
      if (!script.dialogs.some((dialog) => dialog.chatId === chatId)) {
        return Promise.reject(new Error(`Unknown Telegram chat ${chatId}`));
      }
      if (text === '') {
        return Promise.reject(new Error('Refusing to send empty text'));
      }
      return Promise.resolve({ messageId: 'sent-1' });
    },
  };
}
