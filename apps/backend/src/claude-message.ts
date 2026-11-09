import type Anthropic from '@anthropic-ai/sdk';

const maximumAnswerTokens = 2048;

interface ClaudeMessageRequest {
  model: string;
  system: string;
  messages: { role: string; content: unknown }[];
  tools: { name: string; description?: string; strict: boolean; input_schema: unknown }[];
}

function toAnswerBlock(block: Anthropic.Beta.BetaContentBlock) {
  if (block.type === 'tool_use') return { type: block.type, id: block.id, name: block.name, input: block.input };
  if (block.type === 'text') return { type: block.type, text: block.text };
  return { type: block.type };
}

// One Anthropic call shape for every adapter: a system prompt, the messages with their roles and blocks, strict
// tools, low effort, fallbacks.
export function createMessageWith(client: Anthropic) {
  return async (request: ClaudeMessageRequest) => {
    const response = await client.beta.messages.create({
      model: request.model,
      max_tokens: maximumAnswerTokens,
      system: request.system,
      messages: request.messages as Anthropic.Beta.BetaMessageParam[],
      tools: request.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description === undefined ? {} : { description: tool.description }),
        strict: tool.strict,
        input_schema: tool.input_schema as Anthropic.Beta.BetaTool['input_schema'],
      })),
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    return {
      content: response.content.map(toAnswerBlock),
      stop_reason: response.stop_reason,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  };
}
