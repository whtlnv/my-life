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
      const alreadySaved = messages.some(
        (saved) =>
          saved.channel === message.channel &&
          saved.chatId === message.chatId &&
          saved.messageId === message.messageId,
      );
      if (!alreadySaved) messages.push(message);
    },
    listMessages(): ChatMessage[] {
      return messages;
    },
  };
}
