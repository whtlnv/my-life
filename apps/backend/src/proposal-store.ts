import { openDatabase } from './open-database';

interface StoredProposal {
  messageId: string;
  madeAt: string;
  promptVersion: string;
  proposal: unknown;
}

export function openProposalStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS proposals (message_id TEXT NOT NULL, made_at TEXT NOT NULL, prompt_version TEXT NOT NULL, proposal TEXT NOT NULL)',
  );
  const saveProposal = database.prepare(
    'INSERT INTO proposals (message_id, made_at, prompt_version, proposal) VALUES (?, ?, ?, ?)',
  );
  const loadProposals = database.prepare<
    [],
    { message_id: string; made_at: string; prompt_version: string; proposal: string }
  >('SELECT message_id, made_at, prompt_version, proposal FROM proposals ORDER BY rowid');
  return {
    save(stored: StoredProposal): void {
      saveProposal.run(stored.messageId, stored.madeAt, stored.promptVersion, JSON.stringify(stored.proposal ?? null));
    },
    loadAll(): StoredProposal[] {
      return loadProposals.all().map((row) => ({
        messageId: row.message_id,
        madeAt: row.made_at,
        promptVersion: row.prompt_version,
        proposal: JSON.parse(row.proposal) as unknown,
      }));
    },
  };
}
