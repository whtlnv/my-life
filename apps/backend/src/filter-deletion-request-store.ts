import { openDatabase } from './open-database';

export function openFilterDeletionRequestStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS filter_deletion_requests (gmail_filter_id TEXT NOT NULL, requested_at TEXT NOT NULL)',
  );
  const saveRequest = database.prepare(
    'INSERT INTO filter_deletion_requests (gmail_filter_id, requested_at) VALUES (?, ?)',
  );
  const loadRequests = database.prepare<[], { gmail_filter_id: string; requested_at: string }>(
    'SELECT gmail_filter_id, requested_at FROM filter_deletion_requests ORDER BY rowid',
  );
  return {
    save(gmailFilterId: string, requestedAt: string): void {
      saveRequest.run(gmailFilterId, requestedAt);
    },
    loadAll(): { gmailFilterId: string; requestedAt: string }[] {
      return loadRequests.all().map((row) => ({ gmailFilterId: row.gmail_filter_id, requestedAt: row.requested_at }));
    },
  };
}
