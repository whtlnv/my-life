import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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
  it('refuses to answer about a message it never saw instead of inventing blank headers', () => {
    const store = openReportedMessageStore(':memory:');

    expect(() => store.subjectOf('never-reported')).toThrow(/unknown message never-reported/);
  });
});
