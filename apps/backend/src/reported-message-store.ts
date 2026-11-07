import { openDatabase } from './open-database';

export interface MessageRecipients {
  to?: string;
  cc?: string;
}

function createTables(database: ReturnType<typeof openDatabase>): void {
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_messages (message_id TEXT PRIMARY KEY, account_email TEXT NOT NULL)',
  );
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_message_recipients (message_id TEXT PRIMARY KEY, to_header TEXT, cc_header TEXT)',
  );
}

export function openReportedMessageStore(databasePath: string) {
  const database = openDatabase(databasePath);
  createTables(database);
  const saveRecipients = database.prepare(
    'INSERT OR IGNORE INTO reported_message_recipients (message_id, to_header, cc_header) VALUES (?, ?, ?)',
  );
  const loadRecipients = database.prepare<[string], { to_header: string | null; cc_header: string | null }>(
    'SELECT to_header, cc_header FROM reported_message_recipients WHERE message_id = ?',
  );
  const saveMessage = database.prepare(
    'INSERT OR IGNORE INTO reported_messages (message_id, account_email) VALUES (?, ?)',
  );
  const countMessages = database.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM reported_messages');
  const loadAccountEmail = database.prepare<[string], { account_email: string }>(
    'SELECT account_email FROM reported_messages WHERE message_id = ?',
  );
  return {
    save(messageId: string, accountEmail: string, recipients: MessageRecipients): void {
      saveMessage.run(messageId, accountEmail);
      saveRecipients.run(messageId, recipients.to ?? null, recipients.cc ?? null);
    },
    recipientsOf(messageId: string): MessageRecipients {
      const row = loadRecipients.get(messageId);
      return { to: row?.to_header ?? '', cc: row?.cc_header ?? '' };
    },
    accountEmailOf(messageId: string): string {
      return loadAccountEmail.get(messageId)?.account_email ?? '';
    },
    count(): number {
      return countMessages.get()?.count ?? 0;
    },
  };
}
