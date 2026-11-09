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
});
