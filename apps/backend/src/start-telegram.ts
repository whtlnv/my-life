import type { ChatMessage } from './chat-message-store';

interface TelegramDialog {
  unreadCount: number;
  messages: ChatMessage[];
}

export interface TelegramStartClient {
  listDialogs: () => Promise<TelegramDialog[]>;
  onMessage: (handler: (message: ChatMessage) => void) => void;
}

interface StartTelegramDependencies {
  client: TelegramStartClient;
  store: { saveMessage: (message: ChatMessage) => void };
}

export async function startTelegram({ client, store }: StartTelegramDependencies): Promise<void> {
  for (const dialog of await client.listDialogs()) {
    if (dialog.unreadCount === 0) continue;
    dialog.messages.forEach((message) => store.saveMessage(message));
  }
  client.onMessage((message) => store.saveMessage(message));
}
