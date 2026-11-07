import type { CalendarSnapshot } from '@my-life/domain';

import { openDatabase } from './open-database';

export interface StoredCalendarSnapshot {
  accountEmail: string;
  snapshot: CalendarSnapshot;
  reportedAt: Date;
}

export function openCalendarSnapshotStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS calendar_snapshots (account_email TEXT PRIMARY KEY, snapshot TEXT NOT NULL, reported_at TEXT NOT NULL)',
  );
  const saveSnapshot = database.prepare(
    'INSERT INTO calendar_snapshots (account_email, snapshot, reported_at) VALUES (?, ?, ?) ON CONFLICT (account_email) DO UPDATE SET snapshot = excluded.snapshot, reported_at = excluded.reported_at',
  );
  const loadSnapshots = database.prepare<[], { account_email: string; snapshot: string; reported_at: string }>(
    'SELECT account_email, snapshot, reported_at FROM calendar_snapshots ORDER BY rowid',
  );
  return {
    save(snapshot: CalendarSnapshot, reportedAt: Date): void {
      saveSnapshot.run(snapshot.accountEmail, JSON.stringify(snapshot), reportedAt.toISOString());
    },
    loadAll(): StoredCalendarSnapshot[] {
      return loadSnapshots.all().map((row) => ({
        accountEmail: row.account_email,
        snapshot: JSON.parse(row.snapshot) as CalendarSnapshot,
        reportedAt: new Date(row.reported_at),
      }));
    },
  };
}
