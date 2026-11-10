import { describe, expect, it } from 'vitest';

import { openSlackMessageStore } from './slack-message-store';

const messageAt = (timestamp: string) => ({
  workspaceTeamId: 'T0001',
  conversationId: 'D0001',
  senderUserId: 'U0001',
  senderName: 'Ana Ruiz',
  text: `Message at ${timestamp}`,
  timestamp,
});

describe('Slack message store', () => {
  it('lists messages oldest first even when they were saved newest first, as conversations.history hands them over', () => {
    const store = openSlackMessageStore(':memory:');

    store.saveMessage(messageAt('1762700200.000200'));
    store.saveMessage(messageAt('1762700100.000100'));

    expect(store.listMessages().map(({ timestamp }) => timestamp)).toEqual(['1762700100.000100', '1762700200.000200']);
  });
});
