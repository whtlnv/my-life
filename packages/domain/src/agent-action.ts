export interface AgentActionRequest {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly conversationId: string;
  readonly requestedAt: string;
}

export interface AgentActionRecord extends AgentActionRequest {
  readonly outcome: 'refused';
}

export interface AgentActionDecision {
  readonly record: AgentActionRecord;
  readonly effects: readonly never[];
}

export function decideAgentAction(request: AgentActionRequest): AgentActionDecision {
  return { record: { ...request, outcome: 'refused' }, effects: [] };
}
