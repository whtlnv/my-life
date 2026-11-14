import { openDatabase } from './open-database';

export type NotesItem = { text: string; meeting: string; docLink: string; accountEmail: string };

export type StoredNotesItem = NotesItem & { id: string };

export function openNotesItemStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS notes_items (item TEXT NOT NULL)');
  database.exec('CREATE TABLE IF NOT EXISTS notes_item_verdicts (item_id TEXT NOT NULL)');
  const saveVerdict = database.prepare('INSERT INTO notes_item_verdicts (item_id) VALUES (?)');
  const loadDecidedIds = database.prepare<[], { item_id: string }>('SELECT item_id FROM notes_item_verdicts');
  const saveItem = database.prepare('INSERT INTO notes_items (item) VALUES (?)');
  const loadItems = database.prepare<[], { rowid: number; item: string }>(
    'SELECT rowid, item FROM notes_items ORDER BY rowid',
  );
  return {
    save(item: NotesItem): void {
      saveItem.run(JSON.stringify(item));
    },
    markDecided(id: string): void {
      saveVerdict.run(id);
    },
    decidedIds(): Set<string> {
      return new Set(loadDecidedIds.all().map((row) => row.item_id));
    },
    loadAll(): StoredNotesItem[] {
      return loadItems.all().map((row) => ({ id: String(row.rowid), ...(JSON.parse(row.item) as NotesItem) }));
    },
  };
}
