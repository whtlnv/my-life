import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

export function openDatabase(databasePath: string): Database.Database {
  mkdirSync(dirname(databasePath), { recursive: true });
  return new Database(databasePath);
}
