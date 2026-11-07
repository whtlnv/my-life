import { openDatabase } from './open-database';

interface StoredVerdict {
  messageId: string;
  decision: string;
  correction?: unknown;
  decidedAt: string;
}

export function openVerdictStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS verdicts (message_id TEXT NOT NULL, decision TEXT NOT NULL, correction TEXT, decided_at TEXT NOT NULL)',
  );
  const saveVerdict = database.prepare(
    'INSERT INTO verdicts (message_id, decision, correction, decided_at) VALUES (?, ?, ?, ?)',
  );
  const loadVerdicts = database.prepare<
    [],
    { message_id: string; decision: string; correction: string | null; decided_at: string }
  >('SELECT message_id, decision, correction, decided_at FROM verdicts ORDER BY rowid');
  return {
    save(stored: StoredVerdict): void {
      saveVerdict.run(
        stored.messageId,
        stored.decision,
        stored.correction === undefined ? null : JSON.stringify(stored.correction),
        stored.decidedAt,
      );
    },
    loadAll(): StoredVerdict[] {
      return loadVerdicts.all().map((row) => ({
        messageId: row.message_id,
        decision: row.decision,
        correction: row.correction === null ? undefined : (JSON.parse(row.correction) as unknown),
        decidedAt: row.decided_at,
      }));
    },
  };
}
