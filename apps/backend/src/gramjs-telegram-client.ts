interface GramjsClient {
  sendMessage: (entity: string, parameters: { message: string }) => Promise<{ id: number }>;
}

interface GramjsTelegramClient {
  sendText: (chatId: string, text: string) => Promise<{ messageId: string }>;
}

export function createGramjsTelegramClient(gramjsClient: GramjsClient): GramjsTelegramClient {
  return {
    sendText: async (chatId, text) => {
      const sent = await gramjsClient.sendMessage(chatId, { message: text });
      return { messageId: String(sent.id) };
    },
  };
}
