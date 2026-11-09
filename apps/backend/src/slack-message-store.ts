import { openDatabase } from './open-database';

export type SlackMessage = {
  workspaceTeamId: string;
  conversationId: string;
  senderUserId: string;
  text: string;
  timestamp: string;
};

export type SlackMessageStore = ReturnType<typeof openSlackMessageStore>;

export function openSlackMessageStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS slack_messages (workspace_team_id TEXT NOT NULL, conversation_id TEXT NOT NULL, sender_user_id TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL)',
  );
  const insertMessage = database.prepare(
    'INSERT INTO slack_messages (workspace_team_id, conversation_id, sender_user_id, text, timestamp) VALUES (@workspaceTeamId, @conversationId, @senderUserId, @text, @timestamp)',
  );
  const selectMessages = database.prepare<[], SlackMessage>(
    'SELECT workspace_team_id AS workspaceTeamId, conversation_id AS conversationId, sender_user_id AS senderUserId, text, timestamp FROM slack_messages ORDER BY rowid',
  );
  return {
    saveMessage(message: SlackMessage): void {
      insertMessage.run(message);
    },
    listMessages(): SlackMessage[] {
      return selectMessages.all();
    },
  };
}
