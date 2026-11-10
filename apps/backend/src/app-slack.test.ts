import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it, onTestFinished } from 'vitest';

import { createApp } from './app';
import { budgetReviewReport, getJson, postJson, temporaryDatabasePath } from './app.test-support';
import { openSlackMessageStore } from './slack-message-store';

async function appWithVipSlackDirectMessageSentAt(timestamp: string) {
  const databasePath = temporaryDatabasePath();
  openSlackMessageStore(databasePath).saveMessage({
    workspaceTeamId: 'T0001',
    conversationId: 'D0001',
    senderUserId: 'U0001',
    senderName: 'Ana',
    text: 'Can you look at the contract today?',
    timestamp,
  });
  const app = createApp({
    allowedEmails: [],
    databasePath,
    clock: { now: () => new Date('2026-11-04T17:00:00.000Z') },
  });
  await app.request('/slack-contacts/T0001/U0001/marks/vip', { method: 'PUT' });
  return app;
}

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

  it("shows in a Slack item's text at GET /triage-queue each <@U…> mention as @ and that user's display name, or @ and the user id when the name is unknown", async () => {
    const databasePath = temporaryDatabasePath();
    const store = openSlackMessageStore(databasePath);
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0002',
      senderName: 'Bruno',
      text: 'Morning all',
      timestamp: '1762700000.000100',
    });
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: '<@U0002> and <@U0009>, can you review the contract?',
      timestamp: '1762700000.000200',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { slackItems } = await getJson<{ slackItems: { timestamp: string; text: string }[] }>(app, '/triage-queue');

    expect(slackItems.find(({ timestamp }) => timestamp === '1762700000.000200')?.text).toBe(
      '@Bruno and @U0009, can you review the contract?',
    );
  });

  it('lists at GET /triage-queue one Slack item for a conversation with three messages from someone else, carrying the newest of them', async () => {
    const databasePath = temporaryDatabasePath();
    const store = openSlackMessageStore(databasePath);
    for (const [timestamp, text] of [
      ['1762700000.000100', 'Hi there.'],
      ['1762700000.000300', 'Can you look at the contract today?'],
      ['1762700000.000200', 'I have a question.'],
    ]) {
      store.saveMessage({
        workspaceTeamId: 'T0001',
        conversationId: 'D0001',
        senderUserId: 'U0001',
        senderName: 'Ana',
        text: text!,
        timestamp: timestamp!,
      });
    }
    const app = createApp({ allowedEmails: [], databasePath });

    const { slackItems } = await getJson<{ slackItems: { timestamp: string; text: string }[] }>(
      app,
      '/triage-queue',
    );

    expect(slackItems.map(({ timestamp, text }) => ({ timestamp, text }))).toEqual([
      { timestamp: '1762700000.000300', text: 'Can you look at the contract today?' },
    ]);
  });

  it('lists at GET /triage-queue one Slack item for each of two conversations with messages from someone else, each carrying its own newest message', async () => {
    const databasePath = temporaryDatabasePath();
    const store = openSlackMessageStore(databasePath);
    for (const [conversationId, timestamp, text] of [
      ['D0001', '1762700000.000100', 'Hi there.'],
      ['D0002', '1762700000.000200', 'Is the invoice ready?'],
      ['D0001', '1762700000.000300', 'Can you look at the contract today?'],
      ['D0002', '1762700000.000150', 'Morning.'],
    ]) {
      store.saveMessage({
        workspaceTeamId: 'T0001',
        conversationId: conversationId!,
        senderUserId: conversationId === 'D0001' ? 'U0001' : 'U0002',
        senderName: conversationId === 'D0001' ? 'Ana' : 'Bruno',
        text: text!,
        timestamp: timestamp!,
      });
    }
    const app = createApp({ allowedEmails: [], databasePath });

    const { slackItems } = await getJson<{
      slackItems: { conversationId: string; timestamp: string; text: string }[];
    }>(app, '/triage-queue');

    expect(
      slackItems.map(({ conversationId, timestamp, text }) => ({ conversationId, timestamp, text })),
    ).toEqual(
      expect.arrayContaining([
        { conversationId: 'D0001', timestamp: '1762700000.000300', text: 'Can you look at the contract today?' },
        { conversationId: 'D0002', timestamp: '1762700000.000200', text: 'Is the invoice ready?' },
      ]),
    );
    expect(slackItems).toHaveLength(2);
  });

  it('lists at GET /triage-queue no Slack item for a conversation whose newest message the user wrote', async () => {
    const databasePath = temporaryDatabasePath();
    const store = openSlackMessageStore(databasePath);
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0000',
      senderName: 'Francisco',
      text: 'Yes, I will send it back tonight.',
      timestamp: '1762700000.000200',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { slackItems } = await getJson<{ slackItems: unknown[] }>(app, '/triage-queue');

    expect(slackItems).toEqual([]);
  });

  it('lists at GET /triage-queue two Slack items for a thread reply and a top-level message in the same channel, the thread being its own conversation', async () => {
    const databasePath = temporaryDatabasePath();
    const store = openSlackMessageStore(databasePath);
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you review the launch checklist?',
      timestamp: '1762700000.000300',
      threadTimestamp: '1762700000.000050',
    });
    store.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0002',
      senderName: 'Bruno',
      text: 'Is the invoice ready?',
      timestamp: '1762700000.000200',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { slackItems } = await getJson<{ slackItems: { timestamp: string; text: string }[] }>(app, '/triage-queue');

    expect(slackItems.map(({ timestamp, text }) => ({ timestamp, text }))).toEqual(
      expect.arrayContaining([
        { timestamp: '1762700000.000300', text: 'Can you review the launch checklist?' },
        { timestamp: '1762700000.000200', text: 'Is the invoice ready?' },
      ]),
    );
    expect(slackItems).toHaveLength(2);
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

  it('leaves out of GET /waiting-on a Slack DM the user answered later in the same conversation', async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0000',
      senderName: 'Francisco',
      text: 'Yes, looking at it now.',
      timestamp: '1762701000.000100',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([]);
  });

  it('leaves out of GET /waiting-on a Slack mention the user answered in its thread', async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0002',
      senderName: 'Bruno',
      text: '<@U0000> can you review the launch plan?',
      timestamp: '1762700000.000100',
    });
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0000',
      senderName: 'Francisco',
      text: 'Reviewed, looks good.',
      timestamp: '1762701000.000100',
      threadTimestamp: '1762700000.000100',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { people } = await getJson<{ people: unknown[] }>(app, '/waiting-on');

    expect(people).toEqual([]);
  });
  it('orders email and Slack people together at GET /waiting-on, the one who has waited longest first', async () => {
    const databasePath = temporaryDatabasePath();
    openSlackMessageStore(databasePath).saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1793556000.000100',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], databasePath });
    await postJson(app, '/mail-report', budgetReviewReport);

    const { people } = await getJson<{ people: { displayName: string; waitingSince: string }[] }>(app, '/waiting-on');

    expect(people.map(({ displayName, waitingSince }) => ({ displayName, waitingSince }))).toEqual([
      { displayName: 'Ana', waitingSince: '2026-11-01T18:00:00.000Z' },
      { displayName: 'Luis', waitingSince: '2026-11-02T15:00:00.000Z' },
    ]);
  });
  it('lists at GET /people, under Everyone else on channel slack, the sender of a Slack message as a contact with a Slack handle of its workspace and user id', async () => {
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

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([
      expect.objectContaining({
        channel: 'slack',
        displayName: 'Ana',
        slackHandles: [{ workspaceTeamId: 'T0001', userId: 'U0001' }],
      }),
    ]);
  });
  it('lists a Slack contact with several messages once at GET /people, with the time of their newest message as lastMessageAt', async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    const fromAna = {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
    } as const;
    slackMessageStore.saveMessage({ ...fromAna, text: 'Signed it, thanks.', timestamp: '1762707200.000100' });
    slackMessageStore.saveMessage({
      ...fromAna,
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { everyoneElse } = await getJson<{ everyoneElse: unknown[] }>(app, '/people');

    expect(everyoneElse).toEqual([
      expect.objectContaining({
        slackHandles: [{ workspaceTeamId: 'T0001', userId: 'U0001' }],
        lastMessageAt: '2025-11-09T16:53:20.000Z',
      }),
    ]);
  });
  it("leaves out of GET /people the user's own Slack identity, whose sent messages are stored", async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0000',
      senderName: 'Francisco',
      text: 'Yes, looking at it now.',
      timestamp: '1762701000.000100',
      sentByUser: true,
    });
    const app = createApp({ allowedEmails: [], databasePath });

    const { everyoneElse } = await getJson<{ everyoneElse: { slackHandles: unknown[] }[] }>(app, '/people');

    expect(everyoneElse.map(({ slackHandles }) => slackHandles)).toEqual([
      [{ workspaceTeamId: 'T0001', userId: 'U0001' }],
    ]);
  });
  it('lists at GET /slack-contacts/:workspaceTeamId/:userId/timeline the Slack messages of that contact, newest first, each with its workspace and Slack permalink', async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Did you get the contract?',
      timestamp: '1762699000.000100',
    });
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'C0001',
      senderUserId: 'U0002',
      senderName: 'Bruno',
      text: '<@U0000> can you review the launch plan?',
      timestamp: '1762699500.000100',
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

    const { messages } = await getJson<{ messages: unknown[] }>(app, '/slack-contacts/T0001/U0001/timeline');

    expect(messages).toEqual([
      expect.objectContaining({
        workspaceTeamId: 'T0001',
        text: 'Can you look at the contract today?',
        permalink: 'https://app.slack.com/client/T0001/D0001/p1762700000000100',
      }),
      expect.objectContaining({
        workspaceTeamId: 'T0001',
        text: 'Did you get the contract?',
        permalink: 'https://app.slack.com/client/T0001/D0001/p1762699000000100',
      }),
    ]);
  });
  it('lists at GET /people under Urgent, with the reason "VIP waiting", a Slack contact marked vip through PUT /slack-contacts/:workspaceTeamId/:userId/marks/vip whose DM has waited more than 1 business day for a reply', async () => {
    const app = await appWithVipSlackDirectMessageSentAt('1793631600.000100');

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([
      expect.objectContaining({
        channel: 'slack',
        displayName: 'Ana',
        slackHandles: [{ workspaceTeamId: 'T0001', userId: 'U0001' }],
        reasons: ['VIP waiting'],
      }),
    ]);
  });
  it('leaves out of Urgent at GET /people a Slack contact marked vip whose DM has waited less than 1 business day for a reply', async () => {
    const app = await appWithVipSlackDirectMessageSentAt('1793804400.000100');

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([]);
  });
  it('leaves out of Everyone else at GET /people a Slack contact marked vip through PUT /slack-contacts/:workspaceTeamId/:userId/marks/vip, listing it under VIP only', async () => {
    const app = await appWithVipSlackDirectMessageSentAt('1793804400.000100');

    const { vip, everyoneElse } = await getJson<{ vip: unknown[]; everyoneElse: unknown[] }>(app, '/people');

    expect(vip).toEqual([expect.objectContaining({ slackHandles: [{ workspaceTeamId: 'T0001', userId: 'U0001' }] })]);
    expect(everyoneElse).toEqual([]);
  });
  it('lists once under VIP at GET /people, with the time of their newest message, a Slack contact marked vip with several messages', async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    const fromAna = { workspaceTeamId: 'T0001', conversationId: 'D0001', senderUserId: 'U0001', senderName: 'Ana' };
    slackMessageStore.saveMessage({
      ...fromAna,
      text: 'Can you look at the contract today?',
      timestamp: '1762700000.000100',
    });
    slackMessageStore.saveMessage({ ...fromAna, text: 'Page 4 is the one.', timestamp: '1762703600.000100' });
    const app = createApp({ allowedEmails: [], databasePath });
    await app.request('/slack-contacts/T0001/U0001/marks/vip', { method: 'PUT' });

    const { vip } = await getJson<{ vip: unknown[] }>(app, '/people');

    expect(vip).toEqual([
      expect.objectContaining({
        slackHandles: [{ workspaceTeamId: 'T0001', userId: 'U0001' }],
        lastMessageAt: new Date(1762703600 * 1000).toISOString(),
      }),
    ]);
  });
  it('leaves out of Urgent at GET /people a VIP Slack contact the user has replied to in their DM since their message', async () => {
    const databasePath = temporaryDatabasePath();
    const slackMessageStore = openSlackMessageStore(databasePath);
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'U0001',
      senderName: 'Ana',
      text: 'Can you look at the contract today?',
      timestamp: '1762102800.000100',
    });
    slackMessageStore.saveMessage({
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      senderUserId: 'UOWN',
      text: 'Signed it, sending it back now.',
      timestamp: '1762106400.000100',
      sentByUser: true,
    });
    const app = createApp({
      allowedEmails: [],
      databasePath,
      clock: { now: () => new Date('2026-11-04T17:00:00.000Z') },
    });
    await app.request('/slack-contacts/T0001/U0001/marks/vip', { method: 'PUT' });

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([]);
  });
  it('leaves out of Urgent at GET /people a Slack contact whose vip mark the user removed through DELETE /slack-contacts/:workspaceTeamId/:userId/marks/vip, even though their DM has waited more than 1 business day', async () => {
    const app = await appWithVipSlackDirectMessageSentAt('1793631600.000100');
    await app.request('/slack-contacts/T0001/U0001/marks/vip', { method: 'DELETE' });

    const { urgent } = await getJson<{ urgent: unknown[] }>(app, '/people');

    expect(urgent).toEqual([]);
  });
});

// A local Slack that answers auth.test with the user's own id and chat.postMessage with the given answer.
async function localSlackAnsweringPostMessage(answer: unknown): Promise<string> {
  const server: Server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      const body = request.url === '/auth.test' ? { ok: true, user_id: 'UOWN' } : answer;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(
    () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  );
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

describe('createApp Slack sends', () => {
  it('refuses at POST /slack-sends, with 400, a send with empty text', async () => {
    const app = createApp({ allowedEmails: [], slackWorkspaces: [{ teamId: 'T0001', userToken: 'xoxp-test' }] });

    const response = await postJson(app, '/slack-sends', {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      text: '',
    });

    expect(response.status).toBe(400);
  });

  it('refuses at POST /slack-sends, with 400, a send to a workspace that is not configured', async () => {
    const app = createApp({ allowedEmails: [], slackWorkspaces: [{ teamId: 'T0001', userToken: 'xoxp-test' }] });

    const response = await postJson(app, '/slack-sends', {
      workspaceTeamId: 'T0009',
      conversationId: 'D0001',
      text: 'Hi',
    });

    expect(response.status).toBe(400);
  });

  it('answers POST /slack-sends with 502 and the Slack error when Slack rejects the send, and records no sent message', async () => {
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: [],
      databasePath,
      slackApiUrl: await localSlackAnsweringPostMessage({ ok: false, error: 'channel_not_found' }),
      slackWorkspaces: [{ teamId: 'T0001', userToken: 'xoxp-test' }],
    });

    const response = await postJson(app, '/slack-sends', {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      text: 'Hi',
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'channel_not_found' });
    expect(openSlackMessageStore(databasePath).listMessages()).toEqual([]);
  });

  it('stores a send Slack accepts at POST /slack-sends as sent by the user, under the channel and ts chat.postMessage returns', async () => {
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: [],
      databasePath,
      slackApiUrl: await localSlackAnsweringPostMessage({ ok: true, channel: 'D0001', ts: '1762700900.000900' }),
      slackWorkspaces: [{ teamId: 'T0001', userToken: 'xoxp-test' }],
    });

    const response = await postJson(app, '/slack-sends', {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      text: 'On it.',
    });

    expect(response.status).toBe(200);
    expect(openSlackMessageStore(databasePath).listMessages()).toEqual([
      expect.objectContaining({
        workspaceTeamId: 'T0001',
        conversationId: 'D0001',
        senderUserId: 'UOWN',
        text: 'On it.',
        timestamp: '1762700900.000900',
        sentByUser: true,
      }),
    ]);
  });

  it('lists at GET /slack-sends, after a backend restart on the same database file, a send Slack accepted before it', async () => {
    const databasePath = temporaryDatabasePath();
    const slackApiUrl = await localSlackAnsweringPostMessage({ ok: true, channel: 'D0001', ts: '1762700900.000900' });
    const slackWorkspaces = [{ teamId: 'T0001', userToken: 'xoxp-test' }];
    const clock = { now: () => new Date('2026-11-09T17:00:00.000Z') };
    const beforeRestart = createApp({ allowedEmails: [], databasePath, slackApiUrl, slackWorkspaces, clock });
    await postJson(beforeRestart, '/slack-sends', {
      workspaceTeamId: 'T0001',
      conversationId: 'D0001',
      threadTimestamp: '1762700000.000100',
      text: 'On it.',
    });

    const afterRestart = createApp({ allowedEmails: [], databasePath, slackApiUrl, slackWorkspaces, clock });
    const { sends } = await getJson<{ sends: unknown[] }>(afterRestart, '/slack-sends');

    expect(sends).toEqual([
      {
        workspaceTeamId: 'T0001',
        conversationId: 'D0001',
        threadTimestamp: '1762700000.000100',
        text: 'On it.',
        sentAt: '2026-11-09T17:00:00.000Z',
      },
    ]);
  });
});

describe('createApp Slack polls', () => {
  it('asks users.info on a second POST /slack-poll about no user the first poll already named', async () => {
    const usersInfoRequests: string[] = [];
    let historyRequestCount = 0;
    const server: Server = createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const answers: Record<string, () => unknown> = {
          '/auth.test': () => ({ ok: true, user_id: 'UOWN', team: 'PS Mutuus' }),
          '/search.messages': () =>
            url.searchParams.get('query')?.startsWith('is:dm') === true
              ? { ok: true, messages: { matches: [{ ts: '1762700000.000100', channel: { id: 'D0001' } }] } }
              : { ok: true, messages: { matches: [] } },
          '/conversations.history': () => {
            historyRequestCount += 1;
            return {
              ok: true,
              messages: [
                {
                  user: 'U0001',
                  text: `Message ${String(historyRequestCount)}`,
                  ts: `176270000${String(historyRequestCount)}.000100`,
                },
              ],
            };
          },
          '/users.info': () => {
            usersInfoRequests.push(String(url.searchParams.get('user')));
            return { ok: true, user: { profile: { display_name: 'Ana' } } };
          },
        };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(answers[url.pathname]?.() ?? { ok: false, error: 'unknown_method' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    onTestFinished(
      () =>
        new Promise<void>((resolve) =>
          server.close(() => {
            resolve();
          }),
        ),
    );
    const app = createApp({
      allowedEmails: [],
      databasePath: temporaryDatabasePath(),
      slackApiUrl: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
      slackWorkspaces: [{ teamId: 'T0001', userToken: 'xoxp-test' }],
      clock: { now: () => new Date('2026-11-10T18:00:00.000Z') },
    });

    await app.request('/slack-poll', { method: 'POST' });
    await app.request('/slack-poll', { method: 'POST' });

    expect(historyRequestCount).toBe(2);
    expect(usersInfoRequests).toEqual(['U0001']);
  });
});
