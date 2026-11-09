import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NeedsInputPage } from './needs-input-page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NeedsInputPage', () => {
  it("shows each question with its one-key answers; pressing an answer's key sends POST /needs-input/answers and removes the question", async () => {
    const question = {
      kind: 'new-sender',
      senderEmail: 'ana@newclient.example',
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      choices: ['vip', 'ordinary'],
    };
    const answerRequests: { method: string | undefined; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/needs-input') {
          return Promise.resolve(Response.json({ questions: [question] }));
        }
        if (input === '/needs-input/answers') {
          answerRequests.push({ method: init?.method, body: JSON.parse(String(init?.body)) });
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    const user = userEvent.setup();

    render(<NeedsInputPage />);

    const list = await screen.findByRole('list', { name: 'Questions' });
    const [row] = within(list).getAllByRole('listitem');
    if (row === undefined) throw new Error('expected one question row');
    expect(within(row).getByText(question.senderEmail)).toBeInTheDocument();
    const vipAnswer = within(row).getByRole('button', { name: /vip/i });
    expect(within(row).getByRole('button', { name: /ordinary/i })).toHaveAttribute('aria-keyshortcuts');
    const vipKey = vipAnswer.getAttribute('aria-keyshortcuts');
    if (vipKey === null) throw new Error('expected the vip answer to carry its key');
    expect(within(vipAnswer).getByText(vipKey)).toBeInTheDocument();

    await user.keyboard(vipKey);

    expect(answerRequests).toEqual([
      {
        method: 'POST',
        body: { kind: 'new-sender', senderEmail: question.senderEmail, messageId: question.messageId, answer: 'vip' },
      },
    ]);
    expect(screen.queryByText(question.senderEmail)).not.toBeInTheDocument();
  });
  it('lists each waiting task proposal with its title and account; pressing the confirm key sends POST /task-proposals/:id/confirmation and removes the proposal', async () => {
    const proposal = {
      id: 'message-7-0',
      title: 'Send the signed contract',
      due: '2026-11-10T17:00:00.000Z',
      link: 'https://mail.google.com/mail/u/work@example.com/#all/message-7',
      accountEmail: 'work@example.com',
    };
    const decisionRequests: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/needs-input') {
          return Promise.resolve(Response.json({ questions: [] }));
        }
        if (input === '/task-proposals') {
          return Promise.resolve(Response.json({ proposals: [proposal] }));
        }
        if (typeof input === 'string' && input.startsWith('/task-proposals/')) {
          decisionRequests.push({ url: input, method: init?.method });
          return Promise.resolve(Response.json({ confirmed: proposal.id }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    const user = userEvent.setup();

    render(<NeedsInputPage />);

    const list = await screen.findByRole('list', { name: 'Task proposals' });
    const [row] = within(list).getAllByRole('listitem');
    if (row === undefined) throw new Error('expected one task proposal row');
    expect(within(row).getByText(proposal.title)).toBeInTheDocument();
    expect(within(row).getByText(proposal.accountEmail)).toBeInTheDocument();
    const confirmKey = within(row).getByRole('button', { name: /confirm/i }).getAttribute('aria-keyshortcuts');
    if (confirmKey === null) throw new Error('expected the confirm button to carry its key');

    await user.keyboard(confirmKey);

    expect(decisionRequests).toEqual([{ url: `/task-proposals/${proposal.id}/confirmation`, method: 'POST' }]);
    expect(screen.queryByText(proposal.title)).not.toBeInTheDocument();
  });
  it('pressing the reject key on a waiting task proposal sends POST /task-proposals/:id/rejection and removes the proposal', async () => {
    const proposal = {
      id: 'message-8-0',
      title: 'Review the quarterly budget',
      due: null,
      link: 'https://mail.google.com/mail/u/work@example.com/#all/message-8',
      accountEmail: 'work@example.com',
    };
    const decisionRequests: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/needs-input') {
          return Promise.resolve(Response.json({ questions: [] }));
        }
        if (input === '/task-proposals') {
          return Promise.resolve(Response.json({ proposals: [proposal] }));
        }
        if (typeof input === 'string' && input.startsWith('/task-proposals/')) {
          decisionRequests.push({ url: input, method: init?.method });
          return Promise.resolve(Response.json({ rejected: proposal.id }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    const user = userEvent.setup();

    render(<NeedsInputPage />);

    const list = await screen.findByRole('list', { name: 'Task proposals' });
    const [row] = within(list).getAllByRole('listitem');
    if (row === undefined) throw new Error('expected one task proposal row');
    const rejectKey = within(row).getByRole('button', { name: /reject/i }).getAttribute('aria-keyshortcuts');
    if (rejectKey === null) throw new Error('expected the reject button to carry its key');

    await user.keyboard(rejectKey);

    expect(decisionRequests).toEqual([{ url: `/task-proposals/${proposal.id}/rejection`, method: 'POST' }]);
    expect(screen.queryByText(proposal.title)).not.toBeInTheDocument();
  });
});
