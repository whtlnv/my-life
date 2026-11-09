import { describe, expect, it } from 'vitest';

import { agentSpendCeilingReply, agentUnavailableReply, createApp } from './app';
import {
  budgetReviewReport,
  clockAtTenPastThree,
  getJson,
  messageWithQuarterlyNumbersBody,
  postJson,
  temporaryDatabasePath,
} from './app.test-support';
import { openSpendStore } from './spend-store';

describe('backend app: the agent', () => {
  it("creates a conversation on the user's first message and returns the model's text reply as its assistant turn", async () => {
    const agent = {
      respond: () => Promise.resolve({ text: 'You have two open tasks today.', costInUsd: 0.01 }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });

    const response = await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' });

    expect(response.status).toBe(201);
    const conversation = (await response.json()) as { id: string; turns: { role: string; text: string }[] };
    expect(conversation.id).toEqual(expect.any(String));
    expect(conversation.turns).toEqual([
      { role: 'user', text: 'What is on my plate today?' },
      { role: 'assistant', text: 'You have two open tasks today.' },
    ]);
  });

  it("sends the first message of a new conversation to the model as the conversation's only user turn", async () => {
    const askedRequests: unknown[] = [];
    const agent = {
      respond: (request?: { turns: { role: string; text: string }[] }) => {
        askedRequests.push(request);
        return Promise.resolve({ text: 'You have two open tasks today.', costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });

    await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' });

    expect(askedRequests).toEqual([
      expect.objectContaining({ turns: [{ role: 'user', text: 'What is on my plate today?' }] }),
    ]);
  });

  it('sends the earlier user and assistant turns to the model along with the new message', async () => {
    const askedTurns: unknown[] = [];
    const agent = {
      respond: (request?: { turns: { role: string; text: string }[] }) => {
        askedTurns.push(request?.turns);
        return Promise.resolve({ text: 'You have two open tasks today.', costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    const created = (await (
      await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' })
    ).json()) as { id: string };

    await postJson(app, `/agent/conversations/${created.id}/messages`, { message: 'Which one is urgent?' });

    expect(askedTurns.at(-1)).toEqual([
      { role: 'user', text: 'What is on my plate today?' },
      { role: 'assistant', text: 'You have two open tasks today.' },
      { role: 'user', text: 'Which one is urgent?' },
    ]);
  });
  it('returns every turn of an opened conversation in the order it was said', async () => {
    const replies = ['You have two open tasks today.', 'The budget review is urgent.'];
    const agent = { respond: () => Promise.resolve({ text: replies.shift() ?? '', costInUsd: 0.01 }) };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    const created = (await (
      await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' })
    ).json()) as { id: string };
    await postJson(app, `/agent/conversations/${created.id}/messages`, { message: 'Which one is urgent?' });

    const opened = await getJson<{ id: string; turns: unknown[] }>(app, `/agent/conversations/${created.id}`);

    expect(opened).toEqual({
      id: created.id,
      turns: [
        { role: 'user', text: 'What is on my plate today?' },
        { role: 'assistant', text: 'You have two open tasks today.' },
        { role: 'user', text: 'Which one is urgent?' },
        { role: 'assistant', text: 'The budget review is urgent.' },
      ],
    });
  });

  it('lists each conversation with its first user message as its title, most recently active first', async () => {
    const agent = { respond: () => Promise.resolve({ text: 'Noted.', costInUsd: 0.01 }) };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    const first = (await (
      await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' })
    ).json()) as { id: string };
    const second = (await (
      await postJson(app, '/agent/conversations', { message: 'Who is waiting on me?' })
    ).json()) as { id: string };
    await postJson(app, `/agent/conversations/${first.id}/messages`, { message: 'Which one is urgent?' });

    const response = await app.request('/agent/conversations');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversations: [
        { id: first.id, title: 'What is on my plate today?' },
        { id: second.id, title: 'Who is waiting on me?' },
      ],
    });
  });

  it('still returns a conversation and its turns after the backend restarts', async () => {
    const replies = ['You have two open tasks today.', 'The budget review is urgent.'];
    const agent = { respond: () => Promise.resolve({ text: replies.shift() ?? '', costInUsd: 0.01 }) };
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      agent,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp(options);
    const created = (await (
      await postJson(beforeRestart, '/agent/conversations', { message: 'What is on my plate today?' })
    ).json()) as { id: string };
    await postJson(beforeRestart, `/agent/conversations/${created.id}/messages`, { message: 'Which one is urgent?' });

    const afterRestart = createApp(options);
    const opened = await getJson<{ id: string; turns: unknown[] }>(afterRestart, `/agent/conversations/${created.id}`);

    expect(opened).toEqual({
      id: created.id,
      turns: [
        { role: 'user', text: 'What is on my plate today?' },
        { role: 'assistant', text: 'You have two open tasks today.' },
        { role: 'user', text: 'Which one is urgent?' },
        { role: 'assistant', text: 'The budget review is urgent.' },
      ],
    });
  });
  it("logs the cost of each agent call against the daily spend, with the agent's model", async () => {
    const agent = {
      respond: () =>
        Promise.resolve({ text: 'You have two open tasks today.', costInUsd: 0.03, model: 'claude-opus-5-5' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, agent });

    await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' });

    expect(openSpendStore(databasePath).loadAll()).toContainEqual({
      spentAt: '2026-11-02T15:10:00.000Z',
      model: 'claude-opus-5-5',
      costInUsd: 0.03,
    });
  });

  it('answers that the agent is unavailable when no Anthropic key is configured', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const response = await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' });

    expect(response.status).toBe(201);
    const conversation = (await response.json()) as { turns: { role: string; text: string }[] };
    expect(conversation.turns).toEqual([
      { role: 'user', text: 'What is on my plate today?' },
      { role: 'assistant', text: agentUnavailableReply },
    ]);
  });

  it("answers that the daily spend ceiling is reached, without calling the model, once today's spend reaches it", async () => {
    let modelCalls = 0;
    const agent = {
      respond: () => {
        modelCalls += 1;
        return Promise.resolve({ text: 'You have two open tasks today.', costInUsd: 1, model: 'claude-opus-5-5' });
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 1,
      agent,
    });
    await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' });

    const response = await postJson(app, '/agent/conversations', { message: 'Who is waiting on me?' });

    const conversation = (await response.json()) as { turns: { role: string; text: string }[] };
    expect(modelCalls).toBe(1);
    expect(conversation.turns).toEqual([
      { role: 'user', text: 'Who is waiting on me?' },
      { role: 'assistant', text: agentSpendCeilingReply },
    ]);
  });

  it("calls the model and returns its reply while today's spend is below the daily spend ceiling", async () => {
    const replies = ['You have two open tasks today.', 'Ana is waiting on you.'];
    let modelCalls = 0;
    const agent = {
      respond: () => {
        modelCalls += 1;
        return Promise.resolve({ text: replies.shift() ?? '', costInUsd: 0.4, model: 'claude-opus-5-5' });
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 1,
      agent,
    });
    await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' });

    const response = await postJson(app, '/agent/conversations', { message: 'Who is waiting on me?' });

    const conversation = (await response.json()) as { turns: { role: string; text: string }[] };
    expect(modelCalls).toBe(2);
    expect(conversation.turns).toEqual([
      { role: 'user', text: 'Who is waiting on me?' },
      { role: 'assistant', text: 'Ana is waiting on you.' },
    ]);
  });

  it("logs a follow-up message's spend and answers that the daily spend ceiling is reached, without calling the model, once it is", async () => {
    const costs = [0.4, 0.6];
    let modelCalls = 0;
    const agent = {
      respond: () => {
        modelCalls += 1;
        return Promise.resolve({
          text: 'You have two open tasks today.',
          costInUsd: costs.shift() ?? 0,
          model: 'claude-opus-5-5',
        });
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 1,
      agent,
    });
    const created = (await (
      await postJson(app, '/agent/conversations', { message: 'What is on my plate today?' })
    ).json()) as { id: string };
    await postJson(app, `/agent/conversations/${created.id}/messages`, { message: 'Which one is urgent?' });

    await postJson(app, `/agent/conversations/${created.id}/messages`, { message: 'Who is waiting on me?' });

    const conversation = await getJson<{ turns: { role: string; text: string }[] }>(
      app,
      `/agent/conversations/${created.id}`,
    );
    expect(modelCalls).toBe(2);
    expect(conversation.turns.slice(-2)).toEqual([
      { role: 'user', text: 'Who is waiting on me?' },
      { role: 'assistant', text: agentSpendCeilingReply },
    ]);
  });

  it('gives the agent a search_messages tool that returns the stored messages containing the query words, with their id, account, sender, subject, date and Gmail link, and leaves out the others', async () => {
    const offeredTools: { name: string; run: (input: unknown) => Promise<unknown> }[] = [];
    const agent = {
      respond: (request?: { tools?: { name: string; run: (input: unknown) => Promise<unknown> }[] }) => {
        offeredTools.push(...(request?.tools ?? []));
        return Promise.resolve({ text: 'Found it.', costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        messageWithQuarterlyNumbersBody,
        {
          ...budgetReviewReport.messages[0],
          id: 'message-2',
          threadId: 'thread-2',
          subject: 'Lunch on Thursday',
          body: 'Hi Ana, are you free for lunch? Luis',
        },
      ],
    });
    await postJson(app, '/agent/conversations', { message: 'Find the quarterly numbers' });
    const searchMessages = offeredTools.find((tool) => tool.name === 'search_messages');

    const result = await searchMessages?.run({ query: 'quarterly numbers' });

    expect(result).toEqual({
      messages: [
        {
          id: 'message-1',
          accountEmail: 'ana@example.com',
          from: 'Luis <luis@example.com>',
          subject: 'Budget review',
          date: 'Mon, 2 Nov 2026 09:00:00 -0600',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        },
      ],
    });
  });

  it('search_messages ranks a message containing every query word above one containing only some of them', async () => {
    const offeredTools: { name: string; run: (input: unknown) => Promise<unknown> }[] = [];
    const agent = {
      respond: (request?: { tools?: { name: string; run: (input: unknown) => Promise<unknown> }[] }) => {
        offeredTools.push(...(request?.tools ?? []));
        return Promise.resolve({ text: 'Found it.', costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReviewReport.messages[0],
          id: 'message-2',
          threadId: 'thread-2',
          subject: 'Lunch on Thursday',
          body: 'Hi Ana, the lunch numbers are in. Luis',
        },
        { ...messageWithQuarterlyNumbersBody, threadId: 'thread-1' },
      ],
    });
    await postJson(app, '/agent/conversations', { message: 'Find the quarterly numbers' });
    const searchMessages = offeredTools.find((tool) => tool.name === 'search_messages');

    const result = (await searchMessages?.run({ query: 'quarterly numbers' })) as { messages: { id: string }[] };

    expect(result.messages.map((message) => message.id)).toEqual(['message-1', 'message-2']);
  });

  it("read_thread returns every stored message of the given message's thread with its body, oldest first, and no message from another thread", async () => {
    const offeredTools: { name: string; run: (input: unknown) => Promise<unknown> }[] = [];
    const agent = {
      respond: (request?: { tools?: { name: string; run: (input: unknown) => Promise<unknown> }[] }) => {
        offeredTools.push(...(request?.tools ?? []));
        return Promise.resolve({ text: 'Here is the thread.', costInUsd: 0.01 });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReviewReport.messages[0],
          id: 'message-3',
          from: 'Ana <ana@example.com>',
          date: 'Tue, 3 Nov 2026 10:00:00 -0600',
          body: 'Reviewed, looks good. Ana',
        },
        messageWithQuarterlyNumbersBody,
        {
          ...budgetReviewReport.messages[0],
          id: 'message-2',
          threadId: 'thread-2',
          subject: 'Lunch on Thursday',
          body: 'Hi Ana, are you free for lunch? Luis',
        },
      ],
    });
    await postJson(app, '/agent/conversations', { message: 'Show me the budget thread' });
    const readThread = offeredTools.find((tool) => tool.name === 'read_thread');

    const result = await readThread?.run({ messageId: 'message-3' });

    expect(result).toEqual({
      messages: [
        expect.objectContaining({ id: 'message-1', body: messageWithQuarterlyNumbersBody.body }),
        expect.objectContaining({ id: 'message-3', body: 'Reviewed, looks good. Ana' }),
      ],
    });
  });
});
