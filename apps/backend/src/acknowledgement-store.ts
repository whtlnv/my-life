import { openDatabase } from './open-database';

export function openAcknowledgementStore(databasePath: string) {
  const database = openDatabase(databasePath);
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
