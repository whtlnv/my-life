interface GramjsClient {
  sendMessage: (entity: string, parameters: { message: string }) => Promise<{ id: number }>;
  getMe?: () => Promise<{ id: { toString: () => string }; firstName: string; lastName: string }>;
}

interface GramjsTelegramClient {
  sendText: (chatId: string, text: string) => Promise<{ messageId: string }>;
  getOwnAccount: () => Promise<{ id: string; name: string }>;
}

export function createGramjsTelegramClient(gramjsClient: GramjsClient): GramjsTelegramClient {
  return {
    sendText: async (chatId, text) => {
      const sent = await gramjsClient.sendMessage(chatId, { message: text });
      return { messageId: String(sent.id) };
    },
    getOwnAccount: async () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const me = await gramjsClient.getMe!();
      return { id: me.id.toString(), name: `${me.firstName} ${me.lastName}` };
    },
  };
}
