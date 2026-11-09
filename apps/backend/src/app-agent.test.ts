import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { clockAtTenPastThree, getJson, postJson } from './app.test-support';

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
});
