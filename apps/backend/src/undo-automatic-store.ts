import { openDatabase } from './open-database';

export function openUndoAutomaticStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS undone_automatic_messages (message_id TEXT NOT NULL)');
  const saveUndo = database.prepare('INSERT INTO undone_automatic_messages (message_id) VALUES (?)');
  const loadUndos = database.prepare<[], { message_id: string }>(
    'SELECT message_id FROM undone_automatic_messages ORDER BY rowid',
  );
  return {
    save(messageId: string): void {
      saveUndo.run(messageId);
    },
    loadAll(): string[] {
      return loadUndos.all().map((row) => row.message_id);
    },
  };
}
