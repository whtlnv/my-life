export interface AgentActionRequest {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly conversationId: string;
  readonly requestedAt: string;
}

export interface AgentActionRecord extends AgentActionRequest {
  readonly outcome: 'refused' | 'carried-out';
}

export interface AgentActionEffect {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface AgentActionDecision {
  readonly record: AgentActionRecord;
  readonly effects: readonly AgentActionEffect[];
}

// The actions the agent may carry out. Anything else (sending or deleting mail above all) is refused.
const allowedTools = new Set([
  'archive_message',
  'label_message',
  'write_draft',
  'create_task',
  'mark_vip',
  'update_contact',
  'approve_filter_proposal',
  'reject_filter_proposal',
]);

export function decideAgentAction(request: AgentActionRequest): AgentActionDecision {
  if (allowedTools.has(request.tool)) {
    return {
      record: { ...request, outcome: 'carried-out' },
      effects: [{ tool: request.tool, input: request.input }],
    };
  }
  return { record: { ...request, outcome: 'refused' }, effects: [] };
}
