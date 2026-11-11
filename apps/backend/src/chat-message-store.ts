import { openDatabase } from './open-database';

export interface ChatMessage {
  channel: string;
  chatId: string;
  chatTitle: string;
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  sentByUser: boolean;
  chatIsBot?: boolean;
}

export interface ChatMessageVerdict {
  channel: string;
  chatId: string;
  messageId: string;
  decision: string;
}

type ChatMessageRow = Omit<ChatMessage, 'sentByUser' | 'chatIsBot'> & { sentByUser: number; chatIsBot: number };

// A database created before chats were marked as bots has the chat_messages table without its chat_is_bot column.
function addChatIsBotColumnIfMissing(database: ReturnType<typeof openDatabase>): void {
  const columns = database.pragma('table_info(chat_messages)') as { name: string }[];
  if (columns.some((column) => column.name === 'chat_is_bot')) return;
  database.exec('ALTER TABLE chat_messages ADD COLUMN chat_is_bot INTEGER NOT NULL DEFAULT 0');
}

export function openChatMessageStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    `CREATE TABLE IF NOT EXISTS chat_messages (
      channel TEXT NOT NULL, chat_id TEXT NOT NULL, chat_title TEXT NOT NULL, message_id TEXT NOT NULL,
      sender_id TEXT NOT NULL, sender_name TEXT NOT NULL, text TEXT NOT NULL, time TEXT NOT NULL,
      sent_by_user INTEGER NOT NULL, chat_is_bot INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (channel, chat_id, message_id))`,
  );
  addChatIsBotColumnIfMissing(database);
  database.exec(
    `CREATE TABLE IF NOT EXISTS chat_message_verdicts (
      channel TEXT NOT NULL, chat_id TEXT NOT NULL, message_id TEXT NOT NULL, decision TEXT NOT NULL)`,
  );
  const insertVerdict = database.prepare(
    `INSERT INTO chat_message_verdicts (channel, chat_id, message_id, decision) VALUES (?, ?, ?, ?)`,
  );
  const selectVerdicts = database.prepare<[], ChatMessageVerdict>(
    `SELECT channel, chat_id AS chatId, message_id AS messageId, decision
      FROM chat_message_verdicts ORDER BY rowid`,
  );
  const insertMessage = database.prepare(
    `INSERT OR IGNORE INTO chat_messages
      (channel, chat_id, chat_title, message_id, sender_id, sender_name, text, time, sent_by_user, chat_is_bot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const selectMessages = database.prepare<[], ChatMessageRow>(
    `SELECT channel, chat_id AS chatId, chat_title AS chatTitle, message_id AS messageId,
      sender_id AS senderId, sender_name AS senderName, text, time, sent_by_user AS sentByUser, chat_is_bot AS chatIsBot
      FROM chat_messages ORDER BY time, rowid`,
  );
  return {
    saveMessage(message: ChatMessage): void {
      insertMessage.run(
        message.channel,
        message.chatId,
        message.chatTitle,
        message.messageId,
        message.senderId,
        message.senderName,
        message.text,
        message.time,
        message.sentByUser ? 1 : 0,
        message.chatIsBot ? 1 : 0,
      );
    },
    listMessages(): ChatMessage[] {
      return selectMessages.all().map(({ chatIsBot, ...row }) => ({
        ...row,
        sentByUser: row.sentByUser === 1,
        ...(chatIsBot === 1 && { chatIsBot: true }),
      }));
    },
    saveVerdict(verdict: ChatMessageVerdict): void {
      insertVerdict.run(verdict.channel, verdict.chatId, verdict.messageId, verdict.decision);
    },
    listVerdicts(): ChatMessageVerdict[] {
      return selectVerdicts.all();
    },
  };
}
