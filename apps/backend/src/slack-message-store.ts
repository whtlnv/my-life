import { openDatabase } from './open-database';

export type SlackMessage = {
  workspaceTeamId: string;
  conversationId: string;
  senderUserId: string;
  text: string;
  timestamp: string;
  sentByUser?: true;
};

type SavedSlackMessage = Omit<SlackMessage, 'sentByUser'> & {
  threadTimestamp?: string | undefined;
  sentByUser?: boolean;
};

export type SlackMessageStore = ReturnType<typeof openSlackMessageStore>;

export function openSlackMessageStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS slack_messages (workspace_team_id TEXT NOT NULL, conversation_id TEXT NOT NULL, sender_user_id TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL, thread_timestamp TEXT, sent_by_user INTEGER NOT NULL DEFAULT 0, UNIQUE (workspace_team_id, conversation_id, timestamp))',
  );
  const insertMessage = database.prepare(
    'INSERT OR IGNORE INTO slack_messages (workspace_team_id, conversation_id, sender_user_id, text, timestamp, thread_timestamp, sent_by_user) VALUES (@workspaceTeamId, @conversationId, @senderUserId, @text, @timestamp, @threadTimestamp, @sentByUser)',
  );
  const selectMessages = database.prepare<[], Omit<SlackMessage, 'sentByUser'> & { sentByUser: number }>(
    'SELECT workspace_team_id AS workspaceTeamId, conversation_id AS conversationId, sender_user_id AS senderUserId, text, timestamp, sent_by_user AS sentByUser FROM slack_messages ORDER BY rowid',
  );
  const selectNewestTimestampInThread = database.prepare<[string, string], { timestamp: string | null }>(
    'SELECT MAX(timestamp) AS timestamp FROM slack_messages WHERE conversation_id = ? AND thread_timestamp = ?',
  );
  return {
    saveMessage(message: SavedSlackMessage): void {
      insertMessage.run({
        ...message,
        threadTimestamp: message.threadTimestamp ?? null,
        sentByUser: message.sentByUser ? 1 : 0,
      });
    },
    newestTimestampInThread(conversationId: string, threadTimestamp: string): string | undefined {
      return selectNewestTimestampInThread.get(conversationId, threadTimestamp)?.timestamp ?? undefined;
    },
    listMessages(): SlackMessage[] {
      return selectMessages
        .all()
        .map(({ sentByUser, ...message }) => (sentByUser === 1 ? { ...message, sentByUser: true } : message));
    },
  };
}
