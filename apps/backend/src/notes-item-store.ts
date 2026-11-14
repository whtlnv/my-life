import { openDatabase } from './open-database';

export type NotesItem = { text: string; meeting: string; docLink: string; accountEmail: string };

export function openNotesItemStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS notes_items (item TEXT NOT NULL)');
  const saveItem = database.prepare('INSERT INTO notes_items (item) VALUES (?)');
  const loadItems = database.prepare<[], { item: string }>('SELECT item FROM notes_items ORDER BY rowid');
  return {
    save(item: NotesItem): void {
      saveItem.run(JSON.stringify(item));
    },
    loadAll(): NotesItem[] {
      return loadItems.all().map((row) => JSON.parse(row.item) as NotesItem);
    },
  };
}
