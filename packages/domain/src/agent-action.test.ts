import { describe, expect, it } from 'vitest';

import { decideAgentAction } from './agent-action';

describe('decideAgentAction', () => {
  it('refuses an action that sends, records it as refused and produces no effect', () => {
    const request = {
      tool: 'send_message',
      input: { messageId: 'message-1', body: 'Sounds good, see you Monday.' },
      conversationId: 'conversation-1',
      requestedAt: '2026-11-09T15:10:00.000Z',
    };

    expect(decideAgentAction(request)).toEqual({
      record: {
        tool: 'send_message',
        input: { messageId: 'message-1', body: 'Sounds good, see you Monday.' },
        conversationId: 'conversation-1',
        requestedAt: '2026-11-09T15:10:00.000Z',
        outcome: 'refused',
      },
      effects: [],
    });
  });
});
