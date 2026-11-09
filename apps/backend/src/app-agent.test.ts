import { describe, expect, it } from 'vitest';

import { agentSpendCeilingReply, agentUnavailableReply, createApp } from './app';
import {
  budgetReviewReport,
  budgetReviewReportWithQuarterlyNumbersBody,
  ccThreadTriage,
  clockAtTenPastThree,
  filterAnswering,
  firstPendingFilterProposalId,
  getCommands,
  getJson,
  keepProposalExtracting,
  messageWithQuarterlyNumbersBody,
  postCalendarSnapshot,
  postJson,
  postTriageRun,
  proposeBudgetReview,
  putJson,
  reportTriageAndConfirmShopNewsletters,
  shopNewsletterArchiveTriage,
  shopNewslettersFilterProposal,
  temporaryDatabasePath,
  triageAnswering,
  weeklySync,
} from './app.test-support';
import { openSpendStore } from './spend-store';
import { openVerdictStore } from './verdict-store';

interface OfferedTool {
  name: string;
  run: (input: unknown) => Promise<unknown>;
}

// Undoes the agent's action of that tool (and target, when given) by its id from the list of agent actions.
async function undoAgentAction(app: ReturnType<typeof createApp>, tool: string, target?: string) {
  const { actions } = await getJson<{ actions: { id: string; tool: string; target: string }[] }>(app, '/agent/actions');
  const action = actions.find(
    (candidate) => candidate.tool === tool && (target === undefined || candidate.target === target),
  );
  return postJson(app, '/agent/actions/undo', { actionId: action?.id });
}

function agentRecordingOfferedTools(text: string) {
  const offeredTools: OfferedTool[] = [];
  const agent = {
    respond: (request?: { tools?: OfferedTool[] }) => {
      offeredTools.push(...(request?.tools ?? []));
      return Promise.resolve({ text, costInUsd: 0.01 });
    },
  };
  return { agent, offeredTools };
}

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
    const { agent, offeredTools } = agentRecordingOfferedTools('Found it.');
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
    const { agent, offeredTools } = agentRecordingOfferedTools('Found it.');
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
    const { agent, offeredTools } = agentRecordingOfferedTools('Here is the thread.');
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

  it('contact_timeline returns the messages a contact sent, received or is named in, newest first, and no message that does not involve them', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Here is what Luis and you exchanged.');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        budgetReviewReport.messages[0],
        {
          ...budgetReviewReport.messages[0],
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Marta <marta@acme.com>',
          subject: 'Lunch on Thursday',
          date: 'Wed, 4 Nov 2026 10:00:00 -0600',
        },
        {
          ...budgetReviewReport.messages[0],
          id: 'message-3',
          from: 'Ana <ana@example.com>',
          to: 'luis@example.com',
          date: 'Tue, 3 Nov 2026 10:00:00 -0600',
          sentByUser: true,
        },
      ],
    });
    await postJson(app, '/agent/conversations', { message: 'What did Luis and I talk about?' });
    const contactTimeline = offeredTools.find((tool) => tool.name === 'contact_timeline');

    const result = (await contactTimeline?.run({ email: 'luis@example.com' })) as { messages: { id: string }[] };

    expect(result.messages.map((message) => message.id)).toEqual(['message-3', 'message-1']);
  });

  it("calendar_day returns the events of the given date across every account's calendars, in the business time zone, with their Meet links, and no event of another day", async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Here is your Tuesday.');
    const app = createApp({ allowedEmails: ['ana@example.com', 'ana@acme.com'], clock: clockAtTenPastThree, agent });
    await postCalendarSnapshot(app, 'ana@example.com', [
      {
        ...weeklySync,
        id: 'event-late-monday',
        iCalUID: 'event-late-monday@google.com',
        title: 'Late Monday call',
        start: '2026-11-03T05:00:00.000Z',
        end: '2026-11-03T05:30:00.000Z',
      },
      {
        ...weeklySync,
        id: 'event-tuesday-morning',
        iCalUID: 'event-tuesday-morning@google.com',
        title: 'Tuesday standup',
        start: '2026-11-03T15:00:00.000Z',
        end: '2026-11-03T15:15:00.000Z',
        meetLink: 'https://meet.google.com/tue-stan-dup',
      },
    ]);
    await postCalendarSnapshot(app, 'ana@acme.com', [
      {
        ...weeklySync,
        id: 'event-tuesday-evening',
        iCalUID: 'event-tuesday-evening@google.com',
        title: 'Tuesday evening review',
        start: '2026-11-04T01:00:00.000Z',
        end: '2026-11-04T01:30:00.000Z',
        meetLink: 'https://meet.google.com/tue-even-ing',
      },
    ]);
    await postJson(app, '/agent/conversations', { message: 'What is on Tuesday?' });
    const calendarDay = offeredTools.find((tool) => tool.name === 'calendar_day');

    const result = await calendarDay?.run({ date: '2026-11-03' });

    expect(result).toEqual({
      events: [
        expect.objectContaining({ title: 'Tuesday standup', meetLink: 'https://meet.google.com/tue-stan-dup' }),
        expect.objectContaining({
          title: 'Tuesday evening review',
          meetLink: 'https://meet.google.com/tue-even-ing',
        }),
      ],
    });
  });

  it('tasks returns the open tasks with priority, due time, waiting-on person, account and source link, and leaves out done tasks', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('You have one open task.');
    const triage = triageAnswering(
      keepProposalExtracting({
        asks: [{ ask: 'Approve the budget', due: '2026-11-05' }, { ask: 'Send the slides' }],
      }),
    );
    const prioritization = {
      prioritize: (context: { tasks: { id: string; title: string }[] }) =>
        Promise.resolve({
          ranks: context.tasks.map(({ id }, index) => ({ taskId: id, rank: index + 1, reason: 'Due soon' })),
          costInUsd: 0.01,
        }),
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage,
      prioritization,
      agent,
    });
    await proposeBudgetReview(app);
    const proposals = await getJson<{ proposals: { id: string }[] }>(app, '/task-proposals');
    for (const proposal of proposals.proposals) {
      await postJson(app, `/task-proposals/${proposal.id}/confirmation`, {});
    }
    const open = await getJson<{ tasks: { id: string; title: string }[] }>(app, '/tasks');
    const budgetTaskId = String(open.tasks.find(({ title }) => title === 'Approve the budget')?.id);
    const slidesTaskId = String(open.tasks.find(({ title }) => title === 'Send the slides')?.id);
    await putJson(app, `/tasks/${budgetTaskId}/waiting-on`, { person: 'luis@example.com' });
    await postJson(app, `/tasks/${slidesTaskId}/done`, {});
    await app.request('/prioritization-run', { method: 'POST' });
    await postJson(app, '/agent/conversations', { message: 'What is open?' });
    const tasksTool = offeredTools.find((tool) => tool.name === 'tasks');

    const result = await tasksTool?.run({});

    expect(result).toEqual({
      tasks: [
        expect.objectContaining({
          title: 'Approve the budget',
          rank: 1,
          due: '2026-11-05',
          waitingOn: 'luis@example.com',
          accountEmail: 'ana@example.com',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        }),
      ],
    });
  });

  it('digest returns the waiting digests with their account, category, count and summary lines', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('One digest is waiting.');
    const triage = triageAnswering({
      action: 'archive',
      category: 'system-update',
      summary: 'GitHub build passed',
      extract: { system: 'GitHub', severity: 'low', significant: false },
      reason: 'A routine notification',
    });
    const summaryLines = ['GitHub: 1 notice since Monday, none significant'];
    const summary = { summarize: () => Promise.resolve({ lines: summaryLines, costInUsd: 0.01 }) };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, summary, agent });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-build', threadId: 'message-build', from: 'GitHub <noreply@github.com>' },
      ],
    });
    await postTriageRun(app);
    await postJson(app, '/agent/conversations', { message: 'What digests are waiting?' });
    const digestTool = offeredTools.find((tool) => tool.name === 'digest');

    const result = await digestTool?.run({});

    expect(result).toEqual({
      digests: [
        expect.objectContaining({
          accountEmail: 'ana@example.com',
          category: 'system-update',
          count: 1,
          summaryLines,
        }),
      ],
    });
  });

  it('shows a citation of a message a tool returned in that turn with the message and its link', async () => {
    const agent = {
      respond: async (request?: { tools?: OfferedTool[] }) => {
        await request?.tools?.find((tool) => tool.name === 'search_messages')?.run({ query: 'quarterly' });
        return { text: 'Luis sent the quarterly numbers.', citations: [{ id: 'message-1' }], costInUsd: 0.01 };
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    await postJson(app, '/mail-report', budgetReviewReportWithQuarterlyNumbersBody);

    const response = await postJson(app, '/agent/conversations', { message: 'Where are the quarterly numbers?' });

    const conversation = (await response.json()) as { turns: { role: string; citations?: unknown[] }[] };
    expect(conversation.turns.at(-1)?.citations).toEqual([
      expect.objectContaining({
        id: 'message-1',
        subject: 'Budget review',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
      }),
    ]);
  });

  it('shows a citation of a message no tool returned in that turn as unverified, without a link', async () => {
    const agent = {
      respond: async () =>
        Promise.resolve({
          text: 'Luis sent the quarterly numbers.',
          citations: [{ id: 'message-1' }],
          costInUsd: 0.01,
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, agent });
    await postJson(app, '/mail-report', budgetReviewReportWithQuarterlyNumbersBody);

    const response = await postJson(app, '/agent/conversations', { message: 'Where are the quarterly numbers?' });

    const conversation = (await response.json()) as { turns: { role: string; citations?: unknown[] }[] };
    expect(conversation.turns.at(-1)?.citations).toEqual([{ id: 'message-1', verified: false }]);
  });

  it("archive_message stores an archive verdict for the message attributed to the agent, and the message's account receives an archive command", async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can archive that.');
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
      agent,
      databasePath,
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Archive the budget thread' });
    const archiveTool = offeredTools.find((tool) => tool.name === 'archive_message');

    await archiveTool?.run({ messageId: 'message-1' });

    expect(openVerdictStore(databasePath).loadAll()).toContainEqual(
      expect.objectContaining({ messageId: 'message-1', decision: 'confirmed', decidedBy: 'agent' }),
    );
    expect(await (await getCommands(app, 'ana@example.com')).json()).toMatchObject({
      commands: [{ messageId: 'message-1' }],
    });
  });

  it('archive_message on a message id the store does not know returns an error to the model and records nothing', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can archive that.');
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
      agent,
      databasePath,
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Archive the unknown thread' });
    const archiveTool = offeredTools.find((tool) => tool.name === 'archive_message');

    const result = await archiveTool?.run({ messageId: 'message-unknown' });

    expect(result).toEqual({ error: expect.any(String) as unknown });
    expect(openVerdictStore(databasePath).loadAll()).toEqual([]);
    expect(await (await getCommands(app, 'ana@example.com')).json()).toMatchObject({ commands: [] });
  });

  it("label_message sends the message's account a label command with the given label name that leaves the message in the inbox", async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can label that.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Label the budget thread as Finance' });
    const labelTool = offeredTools.find((tool) => tool.name === 'label_message');

    await labelTool?.run({ messageId: 'message-1', labelName: 'Finance' });

    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect(commands).toEqual([expect.objectContaining({ type: 'label', messageId: 'message-1', label: 'Finance' })]);
  });
  it("write_draft sends the replied-to message's account a create-draft command carrying the thread, recipients, subject and body", async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can draft a reply.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Draft a reply to Luis about the budget' });
    const writeDraftTool = offeredTools.find((tool) => tool.name === 'write_draft');

    await writeDraftTool?.run({ messageId: 'message-1', body: 'I will review it by Friday.' });

    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect(commands).toEqual([
      expect.objectContaining({
        type: 'create-draft',
        threadId: 'thread-1',
        to: ['luis@example.com'],
        subject: 'Re: Budget review',
        body: 'I will review it by Friday.',
      }),
    ]);
  });
  it('create_task with a source message creates an open task with the given title, linked to that message and its account', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can make a task of that.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Make a task to review the budget' });
    const createTaskTool = offeredTools.find((tool) => tool.name === 'create_task');

    await createTaskTool?.run({ title: 'Review the budget', sourceMessageId: 'message-1' });

    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(tasks).toEqual([
      expect.objectContaining({
        title: 'Review the budget',
        status: 'open',
        link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        accountEmail: 'ana@example.com',
      }),
    ]);
  });
  it('create_task without a source message creates an open task linked to the agent conversation it came from', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can make a task of that.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    const created = (await (
      await postJson(app, '/agent/conversations', { message: 'Remind me to call the accountant' })
    ).json()) as { id: string };
    const createTaskTool = offeredTools.find((tool) => tool.name === 'create_task');

    await createTaskTool?.run({ title: 'Call the accountant' });

    const { tasks } = await getJson<{ tasks: unknown[] }>(app, '/tasks');
    expect(tasks).toEqual([
      expect.objectContaining({ title: 'Call the accountant', status: 'open', link: `#/agent/${created.id}` }),
    ]);
  });
  it('mark_vip puts the contact under VIP in the People view, as a Needs input answer would', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can mark Luis as VIP.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Luis is my boss, mark him VIP' });
    const markVipTool = offeredTools.find((tool) => tool.name === 'mark_vip');

    await markVipTool?.run({ email: 'luis@example.com' });

    const people = await getJson<{ vip: { emails: string[] }[] }>(app, '/people');
    expect(people.vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
  });
  it('update_contact saves a note, organization and lists on the contact, as an edit from the People page would', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I will remember that.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Luis is my boss' });
    const updateContactTool = offeredTools.find((tool) => tool.name === 'update_contact');

    await updateContactTool?.run({
      email: 'luis@example.com',
      note: 'Luis is my boss',
      organization: 'Psmutuus',
      lists: ['leadership'],
    });

    const { contacts } = await getJson<{ contacts: unknown[] }>(app, '/contacts');
    expect(contacts).toMatchObject([
      { emails: ['luis@example.com'], note: 'Luis is my boss', organization: 'Psmutuus', lists: ['leadership'] },
    ]);
  });
  it('approve_filter_proposal stores an approval for the proposal, and its account receives the create-filter command', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can approve that filter.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering(shopNewslettersFilterProposal),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await postJson(app, '/agent/conversations', { message: 'Approve the shop newsletters filter' });
    const approveTool = offeredTools.find((tool) => tool.name === 'approve_filter_proposal');

    await approveTool?.run({ proposalId });

    const { proposals } = await getJson<{ proposals: unknown[] }>(app, '/filter-proposals');
    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect({ proposals, commands }).toMatchObject({
      proposals: [],
      commands: expect.arrayContaining([
        expect.objectContaining({
          type: 'create-filter',
          id: `create-filter-${proposalId}`,
          criteria: { from: 'news@shop.example.com' },
          labelName: 'Shop newsletters',
        }),
      ]) as unknown,
    });
  });
  it('reject_filter_proposal stores a rejection, and the proposal leaves the filter proposals list', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can reject that filter.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering(shopNewslettersFilterProposal),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await postJson(app, '/agent/conversations', { message: 'Reject the shop newsletters filter' });
    const rejectTool = offeredTools.find((tool) => tool.name === 'reject_filter_proposal');

    await rejectTool?.run({ proposalId });

    const { proposals } = await getJson<{ proposals: unknown[] }>(app, '/filter-proposals');
    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect({ proposals, commands }).toMatchObject({
      proposals: [],
      commands: expect.not.arrayContaining([expect.objectContaining({ type: 'create-filter' })]) as unknown,
    });
  });
  it('lists every agent action newest first, with its tool, target, conversation, time and whether it can be undone', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Done.');
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    const created = (await (
      await postJson(app, '/agent/conversations', { message: 'Archive the budget thread and draft a reply' })
    ).json()) as { id: string };
    await offeredTools.find((tool) => tool.name === 'archive_message')?.run({ messageId: 'message-1' });
    currentTime = new Date('2026-11-02T15:11:00.000Z');
    await offeredTools
      .find((tool) => tool.name === 'write_draft')
      ?.run({ messageId: 'message-1', body: 'I will review it by Friday.' });

    const { actions } = await getJson<{ actions: unknown[] }>(app, '/agent/actions');

    expect(actions).toMatchObject([
      {
        tool: 'write_draft',
        target: 'message-1',
        conversationId: created.id,
        at: '2026-11-02T15:11:00.000Z',
        undoable: false,
      },
      {
        tool: 'archive_message',
        target: 'message-1',
        conversationId: created.id,
        at: '2026-11-02T15:10:00.000Z',
        undoable: true,
      },
    ]);
  });
  it('lists every kind of agent action with an id, its tool, target and conversation, and only archive, label, create task and mark VIP as undoable', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Done.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering(shopNewslettersFilterProposal),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await reportTriageAndConfirmShopNewsletters(app);
    await proposeBudgetReview(app);
    const proposalId = await firstPendingFilterProposalId(app);
    const created = (await (await postJson(app, '/agent/conversations', { message: 'Tidy up my inbox' })).json()) as {
      id: string;
    };
    const run = (name: string, input: unknown) => offeredTools.find((tool) => tool.name === name)?.run(input);
    await run('archive_message', { messageId: 'message-1' });
    await run('label_message', { messageId: 'message-1', labelName: 'Finance' });
    await run('write_draft', { messageId: 'message-1', body: 'I will review it by Friday.' });
    await run('create_task', { title: 'Review the budget', sourceMessageId: 'message-1' });
    await run('mark_vip', { email: 'luis@example.com' });
    await run('update_contact', { email: 'luis@example.com', note: 'Luis is my boss' });
    await run('approve_filter_proposal', { proposalId });
    await run('reject_filter_proposal', { proposalId });
    const { tasks } = await getJson<{ tasks: { id: string; title: string }[] }>(app, '/tasks');
    const taskId = tasks.find(({ title }) => title === 'Review the budget')?.id;

    const { actions } = await getJson<{ actions: unknown[] }>(app, '/agent/actions');

    const conversationId = created.id;
    const id = expect.any(String) as unknown;
    expect(actions).toMatchObject([
      { id, tool: 'reject_filter_proposal', target: proposalId, conversationId, undoable: false },
      { id, tool: 'approve_filter_proposal', target: proposalId, conversationId, undoable: false },
      { id, tool: 'update_contact', target: 'luis@example.com', conversationId, undoable: false },
      { id, tool: 'mark_vip', target: 'luis@example.com', conversationId, undoable: true },
      { id, tool: 'create_task', target: taskId, conversationId, undoable: true },
      { id, tool: 'write_draft', target: 'message-1', conversationId, undoable: false },
      { id, tool: 'label_message', target: 'message-1', conversationId, undoable: true },
      { id, tool: 'archive_message', target: 'message-1', conversationId, undoable: true },
    ]);
  });
  it("undoing an agent archive sends the message's account a command that returns the message to the inbox and removes the archive label", async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Archived.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Archive the budget thread' });
    await offeredTools.find((tool) => tool.name === 'archive_message')?.run({ messageId: 'message-1' });
    const { commands: commandsBeforeUndo } = (await (await getCommands(app, 'ana@example.com')).json()) as {
      commands: { messageId: string; label: string }[];
    };
    const archiveLabel = commandsBeforeUndo.find((command) => command.messageId === 'message-1')?.label;

    await undoAgentAction(app, 'archive_message');

    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect(archiveLabel).toEqual(expect.any(String));
    expect(commands).toContainEqual(
      expect.objectContaining({ type: 'undo-automatic', messageId: 'message-1', label: archiveLabel }),
    );
  });
  it("undoing an agent label sends the message's account a command that removes that label", async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Labeled.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Label the budget thread as Finance' });
    await offeredTools
      .find((tool) => tool.name === 'label_message')
      ?.run({ messageId: 'message-1', labelName: 'Finance' });

    await undoAgentAction(app, 'label_message');

    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect(commands).toContainEqual(
      expect.objectContaining({ type: 'remove-label', messageId: 'message-1', label: 'Finance' }),
    );
  });
  it('undoing an agent VIP mark removes the contact from VIP in the People view', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Marked.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Luis is my boss, mark him VIP' });
    await offeredTools.find((tool) => tool.name === 'mark_vip')?.run({ email: 'luis@example.com' });

    await undoAgentAction(app, 'mark_vip');

    const people = await getJson<{ vip: { emails: string[] }[] }>(app, '/people');
    expect(people.vip).toEqual([]);
  });
  it('undoing an agent-created task removes it from the open tasks and leaves the other agent tasks open', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can make tasks of those.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await postJson(app, '/agent/conversations', { message: 'Remind me to call the accountant and the bank' });
    const createTaskTool = offeredTools.find((tool) => tool.name === 'create_task');
    await createTaskTool?.run({ title: 'Call the accountant' });
    await createTaskTool?.run({ title: 'Call the bank' });
    const created = await getJson<{ tasks: { id: string; title: string }[] }>(app, '/tasks');
    const accountantTaskId = created.tasks.find(({ title }) => title === 'Call the accountant')?.id;

    await undoAgentAction(app, 'create_task', accountantTaskId);

    const { tasks } = await getJson<{ tasks: { title: string }[] }>(app, '/tasks');
    expect(tasks.map(({ title }) => title)).toEqual(['Call the bank']);
  });
  it("an undone agent-created task's history shows it as undone, not done", async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can make a task of that.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await postJson(app, '/agent/conversations', { message: 'Remind me to call the accountant' });
    await offeredTools.find((tool) => tool.name === 'create_task')?.run({ title: 'Call the accountant' });
    const { actions } = await getJson<{ actions: { id: string; tool: string; target: string }[] }>(
      app,
      '/agent/actions',
    );
    const createTaskAction = actions.find(({ tool }) => tool === 'create_task');

    await postJson(app, '/agent/actions/undo', { actionId: createTaskAction?.id });

    const { history } = await getJson<{ history: { transition: string }[] }>(
      app,
      `/tasks/${String(createTaskAction?.target)}/history`,
    );
    const transitions = history.map(({ transition }) => transition);
    expect(transitions).toContain('undone');
    expect(transitions).not.toContain('done');
  });
  it('an undo naming a tool and target the agent never acted on is refused and sends the account no command', async () => {
    const { agent } = agentRecordingOfferedTools('Nothing to do.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'What is in my inbox?' });
    const { commands: commandsBefore } = (await (await getCommands(app, 'ana@example.com')).json()) as {
      commands: unknown[];
    };

    const response = await postJson(app, '/agent/actions/undo', { tool: 'archive_message', target: 'message-1' });

    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect(response.status).toBe(404);
    expect(commands).toEqual(commandsBefore);
  });
  it('undoing an agent draft is refused and sends the account no command beyond the draft itself', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can draft a reply.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Draft a reply to Luis about the budget' });
    await offeredTools
      .find((tool) => tool.name === 'write_draft')
      ?.run({ messageId: 'message-1', body: 'I will review it by Friday.' });

    const response = await undoAgentAction(app, 'write_draft');

    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { type: string }[] };
    expect(response.status).toBe(409);
    expect(commands.map(({ type }) => type)).toEqual(['create-draft']);
  });
  it('undoing an agent filter approval by its action id is refused and sends the account no new command', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I can approve that filter.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering(shopNewslettersFilterProposal),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await postJson(app, '/agent/conversations', { message: 'Approve the shop newsletters filter' });
    await offeredTools.find((tool) => tool.name === 'approve_filter_proposal')?.run({ proposalId });
    const { actions } = await getJson<{ actions: { id: string; tool: string }[] }>(app, '/agent/actions');
    const approvalActionId = actions.find(({ tool }) => tool === 'approve_filter_proposal')?.id;
    const { commands: commandsBeforeUndo } = (await (await getCommands(app, 'ana@example.com')).json()) as {
      commands: unknown[];
    };

    const response = await postJson(app, '/agent/actions/undo', { actionId: approvalActionId });

    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect(response.status).toBe(409);
    expect(commands).toEqual(commandsBeforeUndo);
  });
  it('an undone agent archive shows as undone in the list of agent actions, and undoing it again is refused and sends no new command', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Archived.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/agent/conversations', { message: 'Archive the budget thread' });
    await offeredTools.find((tool) => tool.name === 'archive_message')?.run({ messageId: 'message-1' });
    const { actions: actionsBeforeUndo } = await getJson<{ actions: { id: string }[] }>(app, '/agent/actions');
    const archiveActionId = actionsBeforeUndo[0]?.id;
    await postJson(app, '/agent/actions/undo', { actionId: archiveActionId });
    const { commands: commandsAfterFirstUndo } = (await (await getCommands(app, 'ana@example.com')).json()) as {
      commands: unknown[];
    };

    const secondUndo = await postJson(app, '/agent/actions/undo', { actionId: archiveActionId });

    const { actions } = await getJson<{ actions: unknown[] }>(app, '/agent/actions');
    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect({ actions, secondUndoStatus: secondUndo.status, commands }).toMatchObject({
      actions: [{ id: archiveActionId, tool: 'archive_message', undoable: true, undone: true }],
      secondUndoStatus: 409,
      commands: commandsAfterFirstUndo,
    });
  });
  it('a send_message request from the agent is refused, sends the account no command, and the list of agent actions shows the refusal', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('I cannot send that.');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
      agent,
      databasePath: temporaryDatabasePath(),
    });
    await proposeBudgetReview(app);
    const created = (await (
      await postJson(app, '/agent/conversations', { message: 'Send Luis a reply about the budget' })
    ).json()) as { id: string };
    const { commands: commandsBeforeRequest } = (await (await getCommands(app, 'ana@example.com')).json()) as {
      commands: unknown[];
    };

    await offeredTools
      .find((tool) => tool.name === 'send_message')
      ?.run({ messageId: 'message-1', body: 'I will review it by Friday.' });

    const { actions } = await getJson<{ actions: unknown[] }>(app, '/agent/actions');
    const { commands } = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };
    expect({ actions, commands }).toMatchObject({
      actions: [
        { tool: 'send_message', target: 'message-1', conversationId: created.id, outcome: 'refused', undoable: false },
      ],
      commands: commandsBeforeRequest,
    });
  });
  it('after a backend restart on the same database file, still lists every agent action and refusal with its undone state, and still undoes a reversible one', async () => {
    const { agent, offeredTools } = agentRecordingOfferedTools('Done.');
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
      agent,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp(options);
    await proposeBudgetReview(beforeRestart);
    await postJson(beforeRestart, '/agent/conversations', { message: 'Tidy up the budget thread' });
    const runTool = (name: string, input: unknown) => offeredTools.find((tool) => tool.name === name)?.run(input);
    await runTool('create_task', { title: 'Call the accountant' });
    await runTool('archive_message', { messageId: 'message-1' });
    await runTool('send_message', { messageId: 'message-1', body: 'I will review it by Friday.' });
    const { actions: actionsBeforeRestart } = await getJson<{ actions: { id: string; tool: string }[] }>(
      beforeRestart,
      '/agent/actions',
    );
    const createTaskActionId = actionsBeforeRestart.find(({ tool }) => tool === 'create_task')?.id;
    const archiveActionId = actionsBeforeRestart.find(({ tool }) => tool === 'archive_message')?.id;
    await postJson(beforeRestart, '/agent/actions/undo', { actionId: createTaskActionId });

    const afterRestart = createApp(options);
    const { actions } = await getJson<{ actions: unknown[] }>(afterRestart, '/agent/actions');
    const undoAfterRestart = await postJson(afterRestart, '/agent/actions/undo', { actionId: archiveActionId });

    const { commands } = (await (await getCommands(afterRestart, 'ana@example.com')).json()) as {
      commands: { type: string }[];
    };
    expect({
      actions,
      undoStatus: undoAfterRestart.status,
      commandTypes: commands.map(({ type }) => type),
    }).toMatchObject({
      actions: [
        { tool: 'send_message', target: 'message-1', outcome: 'refused', undoable: false },
        { id: archiveActionId, tool: 'archive_message', target: 'message-1', undoable: true },
        { id: createTaskActionId, tool: 'create_task', undoable: true, undone: true },
      ],
      undoStatus: 200,
      commandTypes: expect.arrayContaining(['undo-automatic']),
    });
  });
});
