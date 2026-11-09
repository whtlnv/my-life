import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { getJson, postJson, temporaryDatabasePath } from './app.test-support';
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

  it('lists at GET /triage-queue a Slack message from someone else as a Slack item offering ignore, act and reply, with its sender, text, workspace and Slack permalink', async () => {
    const databasePath = temporaryDatabasePath();
    openSlackMessageStore(databasePath).saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { slackItems } = await getJson<{ slackItems: unknown[] }>(app, '/triage-queue');

    expect(slackItems).toEqual([
      {
        workspaceTeamId: 'T0001',
        conversationId: 'D0001',
        timestamp: '1762700000.000100',
        senderUserId: 'U0001',
        senderName: 'Ana',
        text: 'Can you look at the contract today?',
        permalink: 'https://app.slack.com/client/T0001/D0001/p1762700000000100',
        choices: ['ignore', 'act', 'reply'],
      },
    ]);
  });

  it('leaves out of GET /triage-queue a Slack message the user sent', async () => {
    const databasePath = temporaryDatabasePath();
    openSlackMessageStore(databasePath).saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0000',
      senderName: 'Francisco',
      text: 'I will send the contract tomorrow.',
      timestamp: '1762700000.000200',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { slackItems } = await getJson<{ slackItems: unknown[] }>(app, '/triage-queue');

    expect(slackItems).toEqual([]);
  });

  it('removes from GET /triage-queue a Slack item once the user confirms ignore on it at POST /slack-verdicts', async () => {
    const databasePath = temporaryDatabasePath();
    openSlackMessageStore(databasePath).saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const response = await postJson(app, '/slack-verdicts', {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      timestamp: '1762700000.000100',
      decision: 'ignore',
    });
    const { slackItems } = await getJson<{ slackItems: unknown[] }>(app, '/triage-queue');

    expect(response.status).toBe(200);
    expect(slackItems).toEqual([]);
  });

  it('keeps out of GET /triage-queue, after a backend restart on the same database file, a Slack item the user confirmed ignore on before it', async () => {
    const databasePath = temporaryDatabasePath();
    openSlackMessageStore(databasePath).saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    const beforeRestart = createApp({ allowedEmails: [], databasePath });
    await postJson(beforeRestart, '/slack-verdicts', {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      timestamp: '1762700000.000100',
      decision: 'ignore',
    });

    const afterRestart = createApp({ allowedEmails: [], databasePath });
    const { slackItems } = await getJson<{ slackItems: unknown[] }>(afterRestart, '/triage-queue');

    expect(slackItems).toEqual([]);
  });

  it('lists at GET /tasks an open task linked to the Slack message, on its workspace, once the user confirms act on it at POST /slack-verdicts', async () => {
    const databasePath = temporaryDatabasePath();
    openSlackMessageStore(databasePath).saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    await postJson(app, '/slack-verdicts', {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      timestamp: '1762700000.000100',
      decision: 'act',
    });
    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');

    expect(tasks).toEqual([
      expect.objectContaining({
        status: 'open',
        link: 'https://app.slack.com/client/T0001/D0001/p1762700000000100',
        accountEmail: 'T0001',
      }),
    ]);
  });

  it('lists at GET /waiting-on, on channel slack and waiting since its timestamp, the sender of a Slack DM the user has not answered later in the conversation', async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0000',
      senderName: 'Francisco',
      text: 'Did you get the contract?',
      timestamp: '1762699000.000100',
      sentByUser: true,
    });
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([
      expect.objectContaining({ channel: 'slack', displayName: 'Ana', waitingSince: '2025-11-09T14:53:20.000Z' }),
    ]);
  });
});
