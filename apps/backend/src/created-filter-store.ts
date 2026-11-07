import { openDatabase } from './open-database';

export function openCreatedFilterStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS created_filters (command_id TEXT NOT NULL, gmail_filter_id TEXT NOT NULL, acknowledged_at TEXT NOT NULL)',
  );
  const saveCreatedFilter = database.prepare(
    'INSERT INTO created_filters (command_id, gmail_filter_id, acknowledged_at) VALUES (?, ?, ?)',
  );
  const loadCreatedFilters = database.prepare<[], { command_id: string; gmail_filter_id: string; acknowledged_at: string }>(
    'SELECT command_id, gmail_filter_id, acknowledged_at FROM created_filters ORDER BY rowid',
  );
  return {
    save(commandId: string, gmailFilterId: string, acknowledgedAt: string): void {
      saveCreatedFilter.run(commandId, gmailFilterId, acknowledgedAt);
    },
    loadAll(): { commandId: string; gmailFilterId: string; acknowledgedAt: string }[] {
      return loadCreatedFilters.all().map((row) => ({
        commandId: row.command_id,
        gmailFilterId: row.gmail_filter_id,
        acknowledgedAt: row.acknowledged_at,
      }));
    },
  };
}
