import { openDatabase } from './open-database';

export type ContactDetails = { lists?: string[]; note?: string };

export function openContactDetailsStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS contact_details (email TEXT NOT NULL, details TEXT NOT NULL)');
  const saveDetails = database.prepare('INSERT INTO contact_details (email, details) VALUES (?, ?)');
  const loadDetails = database.prepare<[], { email: string; details: string }>(
    'SELECT email, details FROM contact_details ORDER BY rowid',
  );
  return {
    save(email: string, details: ContactDetails): void {
      saveDetails.run(email, JSON.stringify(details));
    },
    loadAll(): Record<string, ContactDetails> {
      return Object.fromEntries(
        loadDetails.all().map((row) => [row.email, JSON.parse(row.details) as ContactDetails]),
      );
    },
  };
}
