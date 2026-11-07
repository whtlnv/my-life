import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

export function openReportedMessageStore(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_messages (message_id TEXT PRIMARY KEY, account_email TEXT NOT NULL)',
  );
  const saveMessageId = database.prepare(
    'INSERT OR IGNORE INTO reported_messages (message_id, account_email) VALUES (?, ?)',
  );
  const countMessages = database.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM reported_messages');
  const loadAccountEmail = database.prepare<[string], { account_email: string }>(
    'SELECT account_email FROM reported_messages WHERE message_id = ?',
  );
  return {
    save(messageId: string, accountEmail: string): void {
      saveMessageId.run(messageId, accountEmail);
    },
    accountEmailOf(messageId: string): string {
      return loadAccountEmail.get(messageId)?.account_email ?? '';
    },
    count(): number {
      return countMessages.get()?.count ?? 0;
    },
  };
}
