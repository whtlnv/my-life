import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openDatabase } from './open-database';
import { openReportedMessageStore } from './reported-message-store';

const temporaryDatabasePath = () => join(mkdtempSync(join(tmpdir(), 'my-life-')), 'my-life.sqlite');

describe('reported message store', () => {
  it('still knows the sender and List-Id of a reported message after it is reopened on the same database', () => {
    const databasePath = temporaryDatabasePath();
    const message = {
      id: 'message-1',
      from: 'news@shop.example',
      subject: 'Weekly deals',
      date: '2026-11-07T10:00:00Z',
      to: 'ana@example.com',
      listId: 'deals.shop.example',
      threadId: 'thread-1',
      snippet: 'Deals of the week',
    };
    openReportedMessageStore(databasePath).save(message.id, 'ana@example.com', message);

    const reopened = openReportedMessageStore(databasePath);

    expect(reopened.loadAll()).toEqual([
      {
        messageId: 'message-1',
        accountEmail: 'ana@example.com',
        from: 'news@shop.example',
        listId: 'deals.shop.example',
      },
    ]);
  });
  it('still reads back the body of a reported message after it is reopened on the same database', () => {
    const databasePath = temporaryDatabasePath();
    const message = {
      id: 'message-1',
      from: 'Luis <luis@example.com>',
      subject: 'Budget review',
      date: '2026-11-07T10:00:00Z',
      to: 'ana@example.com',
      threadId: 'thread-1',
      snippet: 'Can you review the budget by Friday?',
      body: 'Hi Ana,\n\nCan you review the budget by Friday? The sheet is attached.\n\nLuis',
    };
    openReportedMessageStore(databasePath).save(message.id, 'ana@example.com', message);

    const reopened = openReportedMessageStore(databasePath);

    expect(reopened.loadReportedMessages()).toMatchObject([{ id: 'message-1', body: message.body }]);
  });
  it('opens a database whose tables were created before bodies existed, keeps its messages, and stores and reloads bodies from then on', () => {
    const databasePath = temporaryDatabasePath();
    const preBodyDatabase = openDatabase(databasePath);
    preBodyDatabase.exec('CREATE TABLE reported_messages (message_id TEXT PRIMARY KEY, account_email TEXT NOT NULL)');
    preBodyDatabase.exec(
      'CREATE TABLE reported_message_recipients (message_id TEXT PRIMARY KEY, to_header TEXT, cc_header TEXT)',
    );
    preBodyDatabase.exec(
      'CREATE TABLE reported_message_senders (message_id TEXT PRIMARY KEY, from_header TEXT NOT NULL, list_id TEXT)',
    );
    preBodyDatabase.exec('CREATE TABLE reported_message_subjects (message_id TEXT PRIMARY KEY, subject TEXT NOT NULL)');
    preBodyDatabase.exec(
      'CREATE TABLE reported_message_dates (message_id TEXT PRIMARY KEY, date_header TEXT NOT NULL)',
    );
    preBodyDatabase.exec(
      'CREATE TABLE reported_message_bodies (message_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, snippet TEXT NOT NULL)',
    );
    preBodyDatabase.exec("INSERT INTO reported_messages VALUES ('old-message', 'ana@example.com')");
    preBodyDatabase.exec("INSERT INTO reported_message_recipients VALUES ('old-message', 'ana@example.com', NULL)");
    preBodyDatabase.exec("INSERT INTO reported_message_senders VALUES ('old-message', 'news@shop.example', NULL)");
    preBodyDatabase.exec("INSERT INTO reported_message_subjects VALUES ('old-message', 'Weekly deals')");
    preBodyDatabase.exec("INSERT INTO reported_message_dates VALUES ('old-message', '2026-11-01T10:00:00Z')");
    preBodyDatabase.exec(
      "INSERT INTO reported_message_bodies VALUES ('old-message', 'thread-old', 'Deals of the week')",
    );
    preBodyDatabase.close();
    const newMessage = {
      from: 'Luis <luis@example.com>',
      subject: 'Budget review',
      date: '2026-11-07T10:00:00Z',
      to: 'ana@example.com',
      threadId: 'thread-new',
      snippet: 'Can you review the budget by Friday?',
      body: 'Hi Ana,\n\nCan you review the budget by Friday?\n\nLuis',
    };

    openReportedMessageStore(databasePath).save('new-message', 'ana@example.com', newMessage);

    expect(openReportedMessageStore(databasePath).loadReportedMessages()).toEqual([
      {
        id: 'old-message',
        accountEmail: 'ana@example.com',
        threadId: 'thread-old',
        snippet: 'Deals of the week',
        from: 'news@shop.example',
        to: 'ana@example.com',
        subject: 'Weekly deals',
        date: '2026-11-01T10:00:00Z',
      },
      { id: 'new-message', accountEmail: 'ana@example.com', ...newMessage },
    ]);
  });
  it('refuses to answer about a message it never saw instead of inventing blank headers', () => {
    const store = openReportedMessageStore(':memory:');

    expect(() => store.subjectOf('never-reported')).toThrow(/unknown message never-reported/);
  });
});
