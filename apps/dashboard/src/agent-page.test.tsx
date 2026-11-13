import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentPage, agentActionsHeading, undoneActionText, unverifiedCitationText } from './agent-page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AgentPage', () => {
  it("typing a question and pressing Enter sends it to POST /agent/conversations and shows the question, then the agent's reply", async () => {
    const question = 'What is on my plate today?';
    const reply = 'You have two open tasks today.';
    const sentMessages: { method: string | undefined; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/agent/conversations' && init?.method === 'POST') {
          sentMessages.push({ method: init.method, body: JSON.parse(init.body as string) });
          return Promise.resolve(
            Response.json(
              {
                id: 'conversation-1',
                turns: [
                  { role: 'user', text: question },
                  { role: 'assistant', text: reply },
                ],
              },
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    const user = userEvent.setup();

    render(<AgentPage />);

    await user.type(screen.getByRole('textbox'), `${question}{Enter}`);

    const shownReply = await screen.findByText(reply);
    const shownQuestion = screen.getByText(question);
    expect(sentMessages).toEqual([{ method: 'POST', body: { message: question } }]);
    expect(shownQuestion.compareDocumentPosition(shownReply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a cited message in the reply as a link to its source, and an unverified citation as unverified without a link', async () => {
    const link = 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              id: 'conversation-1',
              turns: [
                { role: 'user', text: 'Where are the quarterly numbers?' },
                {
                  role: 'assistant',
                  text: 'Luis sent the quarterly numbers.',
                  citations: [
                    { id: 'message-1', subject: 'Budget review', link },
                    { id: 'message-2', verified: false },
                  ],
                },
              ],
            },
            { status: 201 },
          ),
        ),
      ),
    );
    const user = userEvent.setup();

    render(<AgentPage />);

    await user.type(screen.getByRole('textbox'), 'Where are the quarterly numbers?{Enter}');

    const citedLink = await screen.findByRole('link', { name: 'Budget review' });
    expect(citedLink.getAttribute('href')).toBe(link);
    const unverified = screen.getByText(new RegExp(unverifiedCitationText));
    expect(unverified.closest('a')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
  it('choosing a past conversation shows its turns, and the next question is sent to that conversation and its reply shown', async () => {
    const pastQuestion = 'Where are the quarterly numbers?';
    const pastReply = 'Luis sent the quarterly numbers.';
    const nextQuestion = 'When did he send them?';
    const nextReply = 'He sent them on Monday.';
    const turns = [
      { role: 'user', text: pastQuestion },
      { role: 'assistant', text: pastReply },
    ];
    const sentMessages: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/agent/conversations' && init?.method !== 'POST') {
          return Promise.resolve(Response.json({ conversations: [{ id: 'conversation-7', title: pastQuestion }] }));
        }
        if (input === '/agent/conversations/conversation-7' && init?.method !== 'POST') {
          return Promise.resolve(Response.json({ id: 'conversation-7', turns }));
        }
        if (input === '/agent/conversations/conversation-7/messages' && init?.method === 'POST') {
          sentMessages.push({ url: input, body: JSON.parse(init.body as string) });
          turns.push({ role: 'user', text: nextQuestion }, { role: 'assistant', text: nextReply });
          return Promise.resolve(Response.json({}));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    const user = userEvent.setup();

    render(<AgentPage />);

    await user.click(await screen.findByRole('button', { name: pastQuestion }));
    await screen.findByText(pastReply);
    await user.type(screen.getByRole('textbox'), `${nextQuestion}{Enter}`);

    const shownNextReply = await screen.findByText(nextReply);
    expect(sentMessages).toEqual([
      { url: '/agent/conversations/conversation-7/messages', body: { message: nextQuestion } },
    ]);
    expect(
      screen.getByText(pastReply).compareDocumentPosition(shownNextReply) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it('a follow-up question after a new conversation is sent to that conversation instead of starting another', async () => {
    const firstQuestion = 'What is on my plate today?';
    const firstReply = 'You have two open tasks today.';
    const followUp = 'Which one is first?';
    const followUpReply = 'The budget review is first.';
    const turns = [
      { role: 'user', text: firstQuestion },
      { role: 'assistant', text: firstReply },
    ];
    const sentMessages: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof input === 'string' && init?.method === 'POST') {
          sentMessages.push({ url: input, body: JSON.parse(init.body as string) });
        }
        if (input === '/agent/conversations' && init?.method === 'POST') {
          return Promise.resolve(Response.json({ id: 'conversation-1', turns }, { status: 201 }));
        }
        if (input === '/agent/conversations/conversation-1/messages' && init?.method === 'POST') {
          turns.push({ role: 'user', text: followUp }, { role: 'assistant', text: followUpReply });
          return Promise.resolve(Response.json({}));
        }
        if (input === '/agent/conversations/conversation-1' && init?.method !== 'POST') {
          return Promise.resolve(Response.json({ id: 'conversation-1', turns }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    const user = userEvent.setup();

    render(<AgentPage />);

    await user.type(screen.getByRole('textbox'), `${firstQuestion}{Enter}`);
    await screen.findByText(firstReply);
    await user.type(screen.getByRole('textbox'), `${followUp}{Enter}`);

    await screen.findByText(followUpReply);
    expect(sentMessages).toEqual([
      { url: '/agent/conversations', body: { message: firstQuestion } },
      { url: '/agent/conversations/conversation-1/messages', body: { message: followUp } },
    ]);
  });

  it('lists what the agent did with an Undo button only on reversible actions, and pressing Undo posts it and marks the action undone', async () => {
    const sentUndos: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/agent/actions' && init?.method !== 'POST') {
          return Promise.resolve(
            Response.json({
              actions: [
                {
                  id: 'action-1',
                  tool: 'create_task',
                  target: 'task-1',
                  conversationId: 'conversation-1',
                  at: '2026-11-09T10:00:00.000Z',
                  undoable: true,
                },
                {
                  id: 'action-2',
                  tool: 'write_draft',
                  target: 'message-2',
                  conversationId: 'conversation-1',
                  at: '2026-11-09T10:01:00.000Z',
                  undoable: false,
                },
              ],
            }),
          );
        }
        if (input === '/agent/actions/undo' && init?.method === 'POST') {
          sentUndos.push(JSON.parse(init.body as string));
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    const user = userEvent.setup();

    render(<AgentPage />);

    const actionsSection = await screen.findByRole('region', { name: agentActionsHeading });
    const reversibleRow = await within(actionsSection).findByText(/task-1/);
    const irreversibleRow = within(actionsSection).getByText(/message-2/);
    const reversibleItem = reversibleRow.closest('li') as HTMLElement;
    const irreversibleItem = irreversibleRow.closest('li') as HTMLElement;
    expect(within(irreversibleItem).queryByRole('button', { name: /Undo/ })).toBeNull();

    await user.click(within(reversibleItem).getByRole('button', { name: /Undo/ }));

    expect(await within(reversibleItem).findByText(new RegExp(undoneActionText))).toBeTruthy();
    expect(sentUndos).toEqual([{ actionId: 'action-1' }]);
    expect(within(reversibleItem).queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('shows an action the list reports as already undone as undone, with no Undo button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          input === '/agent/actions'
            ? Response.json({
                actions: [
                  {
                    id: 'action-1',
                    tool: 'archive_message',
                    target: 'message-1',
                    conversationId: 'conversation-1',
                    at: '2026-11-09T10:00:00.000Z',
                    undoable: true,
                    undone: true,
                  },
                ],
              })
            : new Response(null, { status: 404 }),
        ),
      ),
    );

    render(<AgentPage />);

    const actionsSection = await screen.findByRole('region', { name: agentActionsHeading });
    const item = (await within(actionsSection).findByText(/message-1/)).closest('li') as HTMLElement;
    expect(within(item).getByText(new RegExp(undoneActionText))).toBeTruthy();
    expect(within(item).queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});
