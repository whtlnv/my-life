import { openDatabase } from './open-database';

export function openCreatedFilterStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS created_filters (command_id TEXT NOT NULL, gmail_filter_id TEXT NOT NULL)');
  const saveCreatedFilter = database.prepare('INSERT INTO created_filters (command_id, gmail_filter_id) VALUES (?, ?)');
  const loadCreatedFilters = database.prepare<[], { command_id: string; gmail_filter_id: string }>(
    'SELECT command_id, gmail_filter_id FROM created_filters ORDER BY rowid',
  );
  return {
    save(commandId: string, gmailFilterId: string): void {
      saveCreatedFilter.run(commandId, gmailFilterId);
    },
    loadAll(): { commandId: string; gmailFilterId: string }[] {
      return loadCreatedFilters.all().map((row) => ({ commandId: row.command_id, gmailFilterId: row.gmail_filter_id }));
    },
  };
}
