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

const allowedTools = new Set(['archive_message']);

export function decideAgentAction(request: AgentActionRequest): AgentActionDecision {
  if (allowedTools.has(request.tool)) {
    return {
      record: { ...request, outcome: 'carried-out' },
      effects: [{ tool: request.tool, input: request.input }],
    };
  }
  return { record: { ...request, outcome: 'refused' }, effects: [] };
}
