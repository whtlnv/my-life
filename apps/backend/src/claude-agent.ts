import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeCostInUsd, type ClaudePricing } from './claude-triage';

interface ClaudeAgentRequest {
  model: string;
  system: string;
  messages: { role: string; content: unknown }[];
  tools: { name: string; description: string; input_schema: unknown }[];
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
  stop_reason?: string | null;
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

function citedSources(content: ClaudeAgentContentBlock[]) {
  return content.flatMap((block) =>
    block.type === 'tool_use' && block.name === 'cite_sources'
      ? (block.input as { ids: string[] }).ids.map((id) => ({ id }))
      : [],
  );
}

// Claude names the messages and events its answer rests on by calling this tool; the backend then checks each id
// against what the turn's searches returned and marks the rest unverified.
const citeSourcesTool: ClaudeAgentTool = {
  name: 'cite_sources',
  description:
    'Cite the messages and events your answer relies on, by the ids the other tools returned. Call it once before answering.',
  inputSchema: {
    type: 'object',
    properties: { ids: { type: 'array', items: { type: 'string' } } },
    required: ['ids'],
  },
  run: () => Promise.resolve({ cited: true }),
};

function toToolDefinition({ name, description, inputSchema }: ClaudeAgentTool) {
  return { name, description, input_schema: inputSchema };
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
    respond: async ({
      turns,
      tools: offeredTools = tools,
    }: {
      turns: { role: string; text: string }[];
      tools?: ClaudeAgentTool[];
    }) => {
      const turnTools = [...offeredTools, citeSourcesTool];
      const prompt = readFileSync(promptPath, 'utf8');
      // The profile is the user's own, gitignored file: without one the agent works from its prompt alone.
      const profilePath = join(profileDirectory, 'accounts.md');
      const system = existsSync(profilePath) ? `${prompt}\n\n${readFileSync(profilePath, 'utf8')}` : prompt;
      const messages: ClaudeAgentRequest['messages'] = turns.map(({ role, text }) => ({ role, content: text }));
      const toolDefinitions = turnTools.map(toToolDefinition);
      let costInUsd = 0;
      const sendMessages = async () => {
        const sent = await createMessage({ model, system, messages, tools: toolDefinitions });
        if (sent) costInUsd += computeCostInUsd(sent.usage, pricing);
        return sent;
      };
      let response = await sendMessages();
      let toolRounds = 0;
      const citations: { id: string }[] = [];
      while (response?.stop_reason === 'tool_use') {
        if (toolRounds === maxToolRounds) return { text: agentToolRoundLimitReply, costInUsd };
        toolRounds += 1;
        citations.push(...citedSources(response.content));
        const toolResults = await runRequestedTools(response.content, turnTools);
        messages.push({ role: 'assistant', content: response.content }, { role: 'user', content: toolResults });
        response = await sendMessages();
      }
      return { text: response?.content.find((block) => block.type === 'text')?.text, costInUsd, citations };
    },
  };
}
