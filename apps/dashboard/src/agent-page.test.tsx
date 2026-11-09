import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentPage, unverifiedCitationText } from './agent-page';

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
});
