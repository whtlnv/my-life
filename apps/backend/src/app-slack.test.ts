import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { getJson, temporaryDatabasePath } from './app.test-support';
import { openSlackMessageStore } from './slack-message-store';

describe('createApp Slack messages', () => {
  it('serves at GET /slack-messages, after a backend restart on the same database file, a Slack message stored before it', async () => {
    const databasePath = temporaryDatabasePath();
    const storedBeforeRestart = {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    };
    createApp({ allowedEmails: [], databasePath });
    openSlackMessageStore(databasePath).saveMessage(storedBeforeRestart);

    const afterRestart = createApp({ allowedEmails: [], databasePath });
    const { messages } = await getJson<{ messages: unknown[] }>(afterRestart, '/slack-messages');

    expect(messages).toEqual([storedBeforeRestart]);
  });
});
