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

export function createScriptedTelegramClient(_script: TelegramScript): ScriptedTelegramClient {
  return {
    sendText: () => Promise.resolve({ messageId: 'sent-1' }),
  };
}
