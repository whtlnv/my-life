import { openDatabase } from './open-database';

export interface MessageRecipients {
  to: string;
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

export interface MessageBody {
  threadId: string;
  snippet: string;
  body?: string;
}

export type ReportedMessageHeaders = MessageRecipients & MessageSender & MessageSubject & MessageDate & MessageBody;

export type StoredReportedMessage = ReportedMessageHeaders & { id: string; accountEmail: string };

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
  database.exec(
    'CREATE TABLE IF NOT EXISTS reported_message_bodies (message_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, snippet TEXT NOT NULL, body_text TEXT)',
  );
  addBodyTextColumnIfMissing(database);
}

// A database created before bodies were stored has the bodies table without its body_text column.
function addBodyTextColumnIfMissing(database: ReturnType<typeof openDatabase>): void {
  const columns = database.pragma('table_info(reported_message_bodies)') as { name: string }[];
  if (columns.some((column) => column.name === 'body_text')) return;
  database.exec('ALTER TABLE reported_message_bodies ADD COLUMN body_text TEXT');
}

export function openReportedMessageStore(databasePath: string) {
  const database = openDatabase(databasePath);
  createTables(database);
  const saveRecipients = database.prepare(
    'INSERT OR IGNORE INTO reported_message_recipients (message_id, to_header, cc_header) VALUES (?, ?, ?)',
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
  const saveDate = database.prepare(
    'INSERT OR IGNORE INTO reported_message_dates (message_id, date_header) VALUES (?, ?)',
  );
  const loadAllMessages = database.prepare<
    [],
    { messageId: string; accountEmail: string; from: string; listId: string | null }
  >(
    'SELECT messages.message_id AS messageId, messages.account_email AS accountEmail, senders.from_header AS "from", senders.list_id AS listId FROM reported_messages AS messages JOIN reported_message_senders AS senders ON senders.message_id = messages.message_id',
  );
  const saveBody = database.prepare(
    'INSERT OR IGNORE INTO reported_message_bodies (message_id, thread_id, snippet, body_text) VALUES (?, ?, ?, ?)',
  );
  // Every message the store has seen, with every header the triage prompt needs, in report order. A message
  // reported before the bodies table existed is left out: it was triaged under the old process anyway.
  const loadReportedMessages = database.prepare<
    [],
    {
      id: string;
      accountEmail: string;
      threadId: string;
      snippet: string;
      body: string | null;
      from: string;
      listId: string | null;
      to: string;
      cc: string | null;
      subject: string;
      date: string;
    }
  >(
    'SELECT messages.message_id AS id, messages.account_email AS accountEmail, bodies.thread_id AS threadId, bodies.snippet AS snippet, bodies.body_text AS body, senders.from_header AS "from", senders.list_id AS listId, recipients.to_header AS "to", recipients.cc_header AS cc, subjects.subject AS subject, dates.date_header AS date FROM reported_messages AS messages JOIN reported_message_bodies AS bodies ON bodies.message_id = messages.message_id JOIN reported_message_senders AS senders ON senders.message_id = messages.message_id JOIN reported_message_recipients AS recipients ON recipients.message_id = messages.message_id JOIN reported_message_subjects AS subjects ON subjects.message_id = messages.message_id JOIN reported_message_dates AS dates ON dates.message_id = messages.message_id ORDER BY messages.rowid',
  );
  const updateBody = database.prepare('UPDATE reported_message_bodies SET body_text = ? WHERE message_id = ?');
  const countMessages = database.prepare('SELECT COUNT(*) FROM reported_messages').pluck();
  const loadHeaders = database.prepare<
    [string],
    { accountEmail: string; to: string; cc: string | null; subject: string; date: string }
  >(
    'SELECT messages.account_email AS accountEmail, recipients.to_header AS "to", recipients.cc_header AS cc, subjects.subject AS subject, dates.date_header AS date FROM reported_messages AS messages JOIN reported_message_recipients AS recipients ON recipients.message_id = messages.message_id JOIN reported_message_subjects AS subjects ON subjects.message_id = messages.message_id JOIN reported_message_dates AS dates ON dates.message_id = messages.message_id WHERE messages.message_id = ?',
  );
  // Every reader asks about a message the store has seen; an unknown id is a programming error, not an empty answer.
  const headersOf = (messageId: string) => {
    const row = loadHeaders.get(messageId);
    if (row === undefined) throw new Error(`reported message store: unknown message ${messageId}`);
    return row;
  };
  return {
    save(messageId: string, accountEmail: string, message: ReportedMessageHeaders): void {
      saveMessage.run(messageId, accountEmail);
      saveRecipients.run(messageId, message.to, message.cc ?? null);
      saveSender.run(messageId, message.from, message.listId ?? null);
      saveSubject.run(messageId, message.subject);
      saveDate.run(messageId, message.date);
      saveBody.run(messageId, message.threadId, message.snippet, message.body ?? null);
    },
    saveBody(messageId: string, body: string): void {
      updateBody.run(body, messageId);
    },
    loadReportedMessages(): StoredReportedMessage[] {
      return loadReportedMessages.all().map(({ listId, cc, body, ...rest }) => ({
        ...rest,
        ...(listId === null ? {} : { listId }),
        ...(cc === null ? {} : { cc }),
        ...(body === null ? {} : { body }),
      }));
    },
    loadAll() {
      return loadAllMessages.all();
    },
    recipientsOf(messageId: string): MessageRecipients {
      const { to, cc } = headersOf(messageId);
      return { to, cc: cc ?? '' };
    },
    subjectOf(messageId: string): string {
      return headersOf(messageId).subject;
    },
    dateOf(messageId: string): string {
      return headersOf(messageId).date;
    },
    accountEmailOf(messageId: string): string {
      return headersOf(messageId).accountEmail;
    },
    count(): number {
      return countMessages.get() as number;
    },
  };
}
