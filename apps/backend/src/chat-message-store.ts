export type ChatMessage = {
  channel: string;
  chatId: string;
  chatTitle: string;
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  sentByUser: boolean;
};

export function openChatMessageStore(_databasePath: string) {
  const messages: ChatMessage[] = [];
  return {
    saveMessage(message: ChatMessage): void {
      messages.push(message);
    },
    listMessages(): ChatMessage[] {
      return messages;
    },
  };
}
