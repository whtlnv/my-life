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

interface ScriptedTelegramClient {
  sendText: (chatId: string, text: string) => Promise<{ messageId: string }>;
}

export function createScriptedTelegramClient(script: TelegramScript): ScriptedTelegramClient {
  return {
    sendText: (chatId) => {
      if (!script.dialogs.some((dialog) => dialog.chatId === chatId)) {
        return Promise.reject(new Error(`Unknown Telegram chat ${chatId}`));
      }
      return Promise.resolve({ messageId: 'sent-1' });
    },
  };
}
