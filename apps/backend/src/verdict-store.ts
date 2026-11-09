import { openDatabase } from './open-database';

export interface StoredVerdict {
  messageId: string;
  decision: string;
  correction?: unknown;
  decidedAt: string;
  decidedBy?: string;
}

export function openVerdictStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS verdicts (message_id TEXT NOT NULL, decision TEXT NOT NULL, correction TEXT, decided_at TEXT NOT NULL)',
  );
  // Kept apart from verdicts so a database created before deciders were recorded needs no migration.
  database.exec(
    'CREATE TABLE IF NOT EXISTS verdict_deciders (verdict_rowid INTEGER PRIMARY KEY, decided_by TEXT NOT NULL)',
  );
  const saveDecider = database.prepare('INSERT INTO verdict_deciders (verdict_rowid, decided_by) VALUES (?, ?)');
  const saveVerdict = database.prepare(
    'INSERT INTO verdicts (message_id, decision, correction, decided_at) VALUES (?, ?, ?, ?)',
  );
  const loadVerdicts = database.prepare<
    [],
    { message_id: string; decision: string; correction: string | null; decided_at: string; decided_by: string | null }
  >(
    'SELECT message_id, decision, correction, decided_at, decided_by FROM verdicts LEFT JOIN verdict_deciders ON verdict_deciders.verdict_rowid = verdicts.rowid ORDER BY verdicts.rowid',
  );
  return {
    save(stored: StoredVerdict): void {
      const { lastInsertRowid } = saveVerdict.run(
        stored.messageId,
        stored.decision,
        stored.correction === undefined ? null : JSON.stringify(stored.correction),
        stored.decidedAt,
      );
      if (stored.decidedBy !== undefined) saveDecider.run(lastInsertRowid, stored.decidedBy);
    },
    loadAll(): StoredVerdict[] {
      return loadVerdicts.all().map((row) => ({
        messageId: row.message_id,
        decision: row.decision,
        correction: row.correction === null ? undefined : (JSON.parse(row.correction) as unknown),
        decidedAt: row.decided_at,
        ...(row.decided_by === null ? {} : { decidedBy: row.decided_by }),
      }));
    },
  };
}
