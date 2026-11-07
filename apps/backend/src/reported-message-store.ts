import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

export function openReportedMessageStore(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS reported_messages (message_id TEXT PRIMARY KEY)');
  const saveMessageId = database.prepare('INSERT OR IGNORE INTO reported_messages (message_id) VALUES (?)');
  const countMessages = database.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM reported_messages');
  return {
    save(messageId: string): void {
      saveMessageId.run(messageId);
    },
    count(): number {
      return countMessages.get()?.count ?? 0;
    },
  };
}
