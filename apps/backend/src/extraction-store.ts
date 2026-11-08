import { openDatabase } from './open-database';

export interface StoredExtraction {
  messageId: string;
  promptVersion: string;
  extractedAt: string;
  extraction: unknown;
}

export function openExtractionStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS extractions (message_id TEXT NOT NULL, prompt_version TEXT NOT NULL, extracted_at TEXT NOT NULL, extraction TEXT NOT NULL)',
  );
  const saveExtraction = database.prepare(
    'INSERT INTO extractions (message_id, prompt_version, extracted_at, extraction) VALUES (?, ?, ?, ?)',
  );
  const loadExtractions = database.prepare<
    [],
    { message_id: string; prompt_version: string; extracted_at: string; extraction: string }
  >('SELECT message_id, prompt_version, extracted_at, extraction FROM extractions ORDER BY rowid');
  return {
    save(stored: StoredExtraction): void {
      saveExtraction.run(stored.messageId, stored.promptVersion, stored.extractedAt, JSON.stringify(stored.extraction));
    },
    loadAll(): StoredExtraction[] {
      return loadExtractions.all().map((row) => ({
        messageId: row.message_id,
        promptVersion: row.prompt_version,
        extractedAt: row.extracted_at,
        extraction: JSON.parse(row.extraction) as unknown,
      }));
    },
  };
}
