import { openDatabase } from './open-database';

interface StoredSpend {
  spentAt: string;
  model: string;
  costInUsd: number;
}

export function openSpendStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS spend (spent_at TEXT NOT NULL, model TEXT NOT NULL, cost_in_usd REAL NOT NULL)',
  );
  const saveSpend = database.prepare('INSERT INTO spend (spent_at, model, cost_in_usd) VALUES (?, ?, ?)');
  const loadSpend = database.prepare<[], { spent_at: string; model: string; cost_in_usd: number }>(
    'SELECT spent_at, model, cost_in_usd FROM spend ORDER BY rowid',
  );
  return {
    save(stored: StoredSpend): void {
      saveSpend.run(stored.spentAt, stored.model, stored.costInUsd);
    },
    loadAll(): StoredSpend[] {
      return loadSpend.all().map((row) => ({ spentAt: row.spent_at, model: row.model, costInUsd: row.cost_in_usd }));
    },
  };
}
