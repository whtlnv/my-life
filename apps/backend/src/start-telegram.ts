import type { ChatMessage } from './chat-message-store';

interface TelegramDialog {
  unreadCount: number;
  messages: ChatMessage[];
}

interface StartTelegramDependencies {
  client: { listDialogs: () => Promise<TelegramDialog[]> };
  store: { saveMessage: (message: ChatMessage) => void };
}

export async function startTelegram({ client, store }: StartTelegramDependencies): Promise<void> {
  for (const dialog of await client.listDialogs()) {
    if (dialog.unreadCount === 0) continue;
    dialog.messages.forEach((message) => store.saveMessage(message));
  }
}
