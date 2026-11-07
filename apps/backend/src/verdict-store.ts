import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

interface StoredVerdict {
  messageId: string;
  decision: string;
  decidedAt: string;
}

export function openVerdictStore(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS verdicts (message_id TEXT NOT NULL, decision TEXT NOT NULL, decided_at TEXT NOT NULL)',
  );
  const saveVerdict = database.prepare('INSERT INTO verdicts (message_id, decision, decided_at) VALUES (?, ?, ?)');
  const loadVerdicts = database.prepare<[], { message_id: string; decision: string; decided_at: string }>(
    'SELECT message_id, decision, decided_at FROM verdicts ORDER BY rowid',
  );
  return {
    save(stored: StoredVerdict): void {
      saveVerdict.run(stored.messageId, stored.decision, stored.decidedAt);
    },
    loadAll(): StoredVerdict[] {
      return loadVerdicts
        .all()
        .map((row) => ({ messageId: row.message_id, decision: row.decision, decidedAt: row.decided_at }));
    },
  };
}
