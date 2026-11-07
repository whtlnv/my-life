import { openDatabase } from './open-database';

export function openCategoryModeStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS category_modes (category TEXT NOT NULL, mode TEXT NOT NULL)');
  const saveMode = database.prepare('INSERT INTO category_modes (category, mode) VALUES (?, ?)');
  const loadModes = database.prepare<[], { category: string; mode: string }>(
    'SELECT category, mode FROM category_modes ORDER BY rowid',
  );
  return {
    save(category: string, mode: string): void {
      saveMode.run(category, mode);
    },
    loadAll(): Record<string, string> {
      return Object.fromEntries(loadModes.all().map((row) => [row.category, row.mode]));
    },
  };
}
