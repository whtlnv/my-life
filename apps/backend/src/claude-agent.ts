import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeCostInUsd, type ClaudePricing } from './claude-triage';

interface ClaudeAgentRequest {
  model: string;
  system?: string;
  messages: { role: string; content: unknown }[];
}

interface ClaudeAgentContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface ClaudeAgentResponse {
  content: ClaudeAgentContentBlock[];
  stop_reason?: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface ClaudeAgentTool {
  name: string;
  description: string;
  inputSchema: unknown;
  run: (input: unknown) => Promise<unknown>;
}

interface ClaudeAgentDependencies {
  model: string;
  promptPath: string;
  profileDirectory: string;
  pricing: ClaudePricing;
  tools?: ClaudeAgentTool[];
  maxToolRounds?: number;
  createMessage: (request: ClaudeAgentRequest) => Promise<ClaudeAgentResponse | undefined>;
}

function missingRequiredProperties(inputSchema: unknown, input: unknown) {
  const { required = [] } = inputSchema as { required?: string[] };
  return required.filter((property) => !(property in (input as object)));
}

async function runRequestedTool(block: ClaudeAgentContentBlock, tools: ClaudeAgentTool[]) {
  const tool = tools.find((candidate) => candidate.name === block.name);
  if (!tool) return { type: 'tool_result', tool_use_id: block.id, is_error: true };
  const missing = missingRequiredProperties(tool.inputSchema, block.input);
  if (missing.length > 0) {
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: `Missing required input: ${missing.join(', ')}`,
    };
  }
  return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(await tool.run(block.input)) };
}

function runRequestedTools(content: ClaudeAgentContentBlock[], tools: ClaudeAgentTool[]) {
  return Promise.all(
    content.filter((block) => block.type === 'tool_use').map((block) => runRequestedTool(block, tools)),
  );
}

export const agentToolRoundLimitReply = 'I stopped because I used too many tool calls for this turn.';

export function createClaudeAgent({
  model,
  promptPath,
  profileDirectory,
  pricing,
  tools = [],
  maxToolRounds = Infinity,
  createMessage,
}: ClaudeAgentDependencies) {
  return {
    respond: async ({ turns }: { turns: { role: string; text: string }[] }) => {
      const prompt = readFileSync(promptPath, 'utf8');
      const profile = readFileSync(join(profileDirectory, 'accounts.md'), 'utf8');
      const system = `${prompt}\n\n${profile}`;
      const messages: ClaudeAgentRequest['messages'] = turns.map(({ role, text }) => ({ role, content: text }));
      let response = await createMessage({ model, system, messages });
      let toolRounds = 0;
      let costInUsd = 0;
      while (response?.stop_reason === 'tool_use') {
        costInUsd += computeCostInUsd(response.usage, pricing);
        if (toolRounds === maxToolRounds) return { text: agentToolRoundLimitReply };
        toolRounds += 1;
        const toolResults = await runRequestedTools(response.content, tools);
        messages.push({ role: 'assistant', content: response.content }, { role: 'user', content: toolResults });
        response = await createMessage({ model, system, messages });
      }
      if (response) costInUsd += computeCostInUsd(response.usage, pricing);
      return { text: response?.content.find((block) => block.type === 'text')?.text, costInUsd };
    },
  };
}
