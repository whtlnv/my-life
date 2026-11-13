import { openDatabase } from './open-database';

export function openListedDigestStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS listed_digests (digest_id TEXT PRIMARY KEY, message_ids TEXT NOT NULL)');
  const saveListedDigest = database.prepare(
    'INSERT OR IGNORE INTO listed_digests (digest_id, message_ids) VALUES (?, ?)',
  );
  const loadListedDigest = database.prepare<[string], { message_ids: string }>(
    'SELECT message_ids FROM listed_digests WHERE digest_id = ?',
  );
  return {
    save(digestId: string, messageIds: string[]): void {
      saveListedDigest.run(digestId, JSON.stringify(messageIds));
    },
    load(digestId: string): string[] | undefined {
      const row = loadListedDigest.get(digestId);
      return row && (JSON.parse(row.message_ids) as string[]);
    },
  };
}
