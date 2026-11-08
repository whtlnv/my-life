import { openDatabase } from './open-database';

export type ContactDetails = { lists?: string[]; note?: string };

export function openContactDetailsStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS contact_details (email TEXT NOT NULL, details TEXT NOT NULL)');
  database.exec('CREATE TABLE IF NOT EXISTS contact_marks (email TEXT NOT NULL, mark TEXT NOT NULL)');
  const insertDetails = database.prepare('INSERT INTO contact_details (email, details) VALUES (?, ?)');
  const loadDetails = database.prepare<[], { email: string; details: string }>(
    'SELECT email, details FROM contact_details ORDER BY rowid',
  );
  const insertMark = database.prepare('INSERT INTO contact_marks (email, mark) VALUES (?, ?)');
  const loadMarkedEmails = database.prepare<[], { email: string }>('SELECT email FROM contact_marks');
  return {
    save(email: string, details: ContactDetails): void {
      insertDetails.run(email, JSON.stringify(details));
    },
    loadAll(): Record<string, ContactDetails> {
      return Object.fromEntries(
        loadDetails.all().map((row) => [row.email, JSON.parse(row.details) as ContactDetails]),
      );
    },
    saveMark(email: string, mark: string): void {
      insertMark.run(email, mark);
    },
    markedEmails(): Set<string> {
      return new Set(loadMarkedEmails.all().map((row) => row.email));
    },
  };
}
