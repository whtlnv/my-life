import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { clockAtTenPastThree, postJson } from './app.test-support';

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
});
