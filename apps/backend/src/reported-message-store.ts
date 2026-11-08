import { openDatabase } from './open-database';

export interface MessageRecipients {
  to?: string;
  cc?: string;
}

export interface MessageSender {
  from: string;
  listId?: string;
}

export interface MessageSubject {
  subject: string;
}

export interface MessageDate {
  date: string;
}

function createTables(database: ReturnType<typeof openDatabase>): void {
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_messages (message_id TEXT PRIMARY KEY, account_email TEXT NOT NULL)',
  );
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_message_recipients (message_id TEXT PRIMARY KEY, to_header TEXT, cc_header TEXT)',
  );
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_message_senders (message_id TEXT PRIMARY KEY, from_header TEXT NOT NULL, list_id TEXT)',
  );
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_message_subjects (message_id TEXT PRIMARY KEY, subject TEXT NOT NULL)',
  );
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_message_dates (message_id TEXT PRIMARY KEY, date_header TEXT NOT NULL)',
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
  const saveSender = database.prepare(
    'INSERT OR IGNORE INTO reported_message_senders (message_id, from_header, list_id) VALUES (?, ?, ?)',
  );
  const saveSubject = database.prepare(
    'INSERT OR IGNORE INTO reported_message_subjects (message_id, subject) VALUES (?, ?)',
  );
  const loadSubject = database.prepare<[string], { subject: string }>(
    'SELECT subject FROM reported_message_subjects WHERE message_id = ?',
  );
  const saveDate = database.prepare(
    'INSERT OR IGNORE INTO reported_message_dates (message_id, date_header) VALUES (?, ?)',
  );
  const loadDate = database.prepare<[string], { date_header: string }>(
    'SELECT date_header FROM reported_message_dates WHERE message_id = ?',
  );
  const loadAllMessages = database.prepare<
    [],
    { messageId: string; accountEmail: string; from: string; listId: string | null }
  >(
    'SELECT messages.message_id AS messageId, messages.account_email AS accountEmail, senders.from_header AS "from", senders.list_id AS listId FROM reported_messages AS messages JOIN reported_message_senders AS senders ON senders.message_id = messages.message_id',
  );
  const countMessages = database.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM reported_messages');
  const loadAccountEmail = database.prepare<[string], { account_email: string }>(
    'SELECT account_email FROM reported_messages WHERE message_id = ?',
  );
  return {
    save(messageId: string, accountEmail: string, message: MessageRecipients & MessageSender & MessageSubject & MessageDate): void {
      saveMessage.run(messageId, accountEmail);
      saveRecipients.run(messageId, message.to ?? null, message.cc ?? null);
      saveSender.run(messageId, message.from, message.listId ?? null);
      saveSubject.run(messageId, message.subject);
      saveDate.run(messageId, message.date);
    },
    loadAll() {
      return loadAllMessages.all();
    },
    recipientsOf(messageId: string): MessageRecipients {
      const row = loadRecipients.get(messageId);
      return { to: row?.to_header ?? '', cc: row?.cc_header ?? '' };
    },
    subjectOf(messageId: string): string {
      return loadSubject.get(messageId)?.subject ?? '';
    },
    dateOf(messageId: string): string {
      return loadDate.get(messageId)?.date_header ?? '';
    },
    accountEmailOf(messageId: string): string {
      return loadAccountEmail.get(messageId)?.account_email ?? '';
    },
    count(): number {
      return countMessages.get()?.count ?? 0;
    },
  };
}
