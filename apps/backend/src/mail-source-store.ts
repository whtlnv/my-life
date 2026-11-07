import type { SourceReport } from '@my-life/domain';

import { openDatabase } from './open-database';

export function openMailSourceStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS mail_sources (account_email TEXT PRIMARY KEY, last_reported_at TEXT NOT NULL)',
  );
  const saveSource = database.prepare(
    'INSERT INTO mail_sources (account_email, last_reported_at) VALUES (?, ?) ON CONFLICT (account_email) DO UPDATE SET last_reported_at = excluded.last_reported_at',
  );
  const loadSources = database.prepare<[], { account_email: string; last_reported_at: string }>(
    'SELECT account_email, last_reported_at FROM mail_sources ORDER BY rowid',
  );
  return {
    save(accountEmail: string, reportedAt: Date): void {
      saveSource.run(accountEmail, reportedAt.toISOString());
    },
    loadAll(): SourceReport[] {
      return loadSources.all().map((row) => ({
        email: row.account_email,
        source: 'mail',
        lastReportedAt: row.last_reported_at,
      }));
    },
  };
}
