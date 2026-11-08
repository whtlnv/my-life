import { openDatabase } from './open-database';

export interface ContactDetails {
  lists?: string[];
  note?: string;
  organization?: string;
}
export interface ImportedContactRecord {
  displayName: string;
  emails: string[];
}

export function openContactDetailsStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS contact_details (email TEXT NOT NULL, details TEXT NOT NULL)');
  database.exec('CREATE TABLE IF NOT EXISTS contact_marks (email TEXT NOT NULL, mark TEXT NOT NULL)');
  // Every mark the user removed in the app, kept so a later Google Contacts import never puts it back.
  database.exec('CREATE TABLE IF NOT EXISTS contact_mark_removals (email TEXT NOT NULL, mark TEXT NOT NULL)');
  database.exec('CREATE TABLE IF NOT EXISTS imported_contacts (display_name TEXT NOT NULL, emails TEXT NOT NULL)');
  const insertDetails = database.prepare('INSERT INTO contact_details (email, details) VALUES (?, ?)');
  const loadDetails = database.prepare<[], { email: string; details: string }>(
    'SELECT email, details FROM contact_details ORDER BY rowid',
  );
  const insertMark = database.prepare('INSERT INTO contact_marks (email, mark) VALUES (?, ?)');
  const loadMarkedEmails = database.prepare<[], { email: string }>('SELECT email FROM contact_marks');
  const deleteMark = database.prepare('DELETE FROM contact_marks WHERE email = ? AND mark = ?');
  const insertRemoval = database.prepare('INSERT INTO contact_mark_removals (email, mark) VALUES (?, ?)');
  const findRemoval = database.prepare<[string, string], { email: string }>(
    'SELECT email FROM contact_mark_removals WHERE email = ? AND mark = ? LIMIT 1',
  );
  const insertImported = database.prepare('INSERT INTO imported_contacts (display_name, emails) VALUES (?, ?)');
  const loadImported = database.prepare<[], { display_name: string; emails: string }>(
    'SELECT display_name, emails FROM imported_contacts ORDER BY rowid',
  );
  return {
    save(email: string, details: ContactDetails): void {
      insertDetails.run(email, JSON.stringify(details));
    },
    loadAll(): Record<string, ContactDetails> {
      const merged: Record<string, ContactDetails> = {};
      for (const row of loadDetails.all()) {
        merged[row.email] = { ...merged[row.email], ...(JSON.parse(row.details) as ContactDetails) };
      }
      return merged;
    },
    saveMark(email: string, mark: string): void {
      insertMark.run(email, mark);
    },
    removeMark(email: string, mark: string): void {
      deleteMark.run(email, mark);
      insertRemoval.run(email, mark);
    },
    userRemovedMark(email: string, mark: string): boolean {
      return findRemoval.get(email, mark) !== undefined;
    },
    markedEmails(): Set<string> {
      return new Set(loadMarkedEmails.all().map((row) => row.email));
    },
    saveImported({ displayName, emails }: ImportedContactRecord): void {
      insertImported.run(displayName, JSON.stringify(emails));
    },
    loadImported(): ImportedContactRecord[] {
      return loadImported
        .all()
        .map((row) => ({ displayName: row.display_name, emails: JSON.parse(row.emails) as string[] }));
    },
  };
}
