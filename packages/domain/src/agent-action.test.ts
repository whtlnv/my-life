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

  it('carries out an allowed action, recording it with its conversation and time', () => {
    const request = {
      tool: 'archive_message',
      input: { messageId: 'message-1' },
      conversationId: 'conversation-1',
      requestedAt: '2026-11-09T15:12:00.000Z',
    };

    expect(decideAgentAction(request)).toEqual({
      record: {
        tool: 'archive_message',
        input: { messageId: 'message-1' },
        conversationId: 'conversation-1',
        requestedAt: '2026-11-09T15:12:00.000Z',
        outcome: 'carried-out',
      },
      effects: [{ tool: 'archive_message', input: { messageId: 'message-1' } }],
    });
  });

  it('carries out every action the agent may take, and refuses deleting mail like sending it', () => {
    const outcomeOf = (tool: string) =>
      decideAgentAction({ tool, input: {}, conversationId: 'conversation-1', requestedAt: '2026-11-09T15:12:00.000Z' })
        .record.outcome;
    const mayTake = [
      'archive_message',
      'label_message',
      'write_draft',
      'create_task',
      'mark_vip',
      'update_contact',
      'approve_filter_proposal',
      'reject_filter_proposal',
    ];

    expect(mayTake.map(outcomeOf)).toEqual(mayTake.map(() => 'carried-out'));
    expect(['send_message', 'delete_message'].map(outcomeOf)).toEqual(['refused', 'refused']);
  });
});
