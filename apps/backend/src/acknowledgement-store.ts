import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

export function openAcknowledgementStore(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS acknowledgements (command_id TEXT NOT NULL)');
  const saveAcknowledgement = database.prepare('INSERT INTO acknowledgements (command_id) VALUES (?)');
  const loadAcknowledgements = database.prepare<[], { command_id: string }>(
    'SELECT command_id FROM acknowledgements ORDER BY rowid',
  );
  return {
    save(commandId: string): void {
      saveAcknowledgement.run(commandId);
    },
    loadAll(): string[] {
      return loadAcknowledgements.all().map((row) => row.command_id);
    },
  };
}
