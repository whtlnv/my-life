import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { triageProposal } from '@my-life/contracts';
import { isAddressedToUser } from '@my-life/domain';

interface ClaudeResponse {
  content: { type: string; input?: unknown }[];
  usage?: { input_tokens: number; output_tokens: number };
}

interface ClaudeTriageDependencies {
  model: string;
  promptPath?: string;
  profileDirectory?: string;
  pricing?: { inputPerMillionTokensInUsd: number; outputPerMillionTokensInUsd: number };
  createMessage: (request: {
    model: string;
    system?: string;
    messages: { role: string; content: string }[];
    tools?: { name: string; strict: boolean; input_schema: unknown }[];
  }) => Promise<ClaudeResponse>;
}

function readProfile(profileDirectory: string): string {
  return readdirSync(profileDirectory)
    .map((fileName) => readFileSync(join(profileDirectory, fileName), 'utf8'))
    .join('\n\n');
}

interface TriageMessage {
  id: string;
  threadId?: string;
  date: string;
  accountEmail?: string;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  snippet?: string;
  listId?: string;
}

function describeMessage(message: TriageMessage, examples: unknown[] | undefined): string {
  return JSON.stringify({
    from: message.from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    date: message.date,
    listId: message.listId,
    snippet: message.snippet,
    addressedToUser: isAddressedToUser({ to: message.to ?? '' }, message.accountEmail ?? ''),
    examples,
  });
}

interface TriageOutcome {
  promptVersion?: string;
  proposal?: unknown;
  failure?: { input: unknown };
  costInUsd?: number;
}

const proposeTriageTool = { name: 'propose_triage', strict: true, input_schema: triageProposal.toJSONSchema() };

function readToolUseInput(response: ClaudeResponse): unknown {
  return response.content.find((block) => block.type === 'tool_use')?.input;
}

function computeCostInUsd(
  usage: NonNullable<ClaudeResponse['usage']>,
  pricing: NonNullable<ClaudeTriageDependencies['pricing']>,
): number {
  return (
    (usage.input_tokens * pricing.inputPerMillionTokensInUsd +
      usage.output_tokens * pricing.outputPerMillionTokensInUsd) /
    1_000_000
  );
}

export function createClaudeTriage({
  model,
  promptPath,
  profileDirectory,
  pricing,
  createMessage,
}: ClaudeTriageDependencies) {
  const costOf = (response: ClaudeResponse): number | undefined =>
    pricing === undefined || response.usage === undefined ? undefined : computeCostInUsd(response.usage, pricing);
  return {
    propose: async (message: TriageMessage, examples?: unknown[]): Promise<TriageOutcome | undefined> => {
      const messages = [{ role: 'user', content: describeMessage(message, examples) }];
      if (promptPath === undefined) {
        const response = await createMessage({ model, messages });
        const input = readToolUseInput(response);
        if (!triageProposal.safeParse(input).success) {
          const costInUsd = costOf(response);
          if (costInUsd !== undefined) {
            return { failure: { input }, costInUsd };
          }
          return { failure: { input } };
        }
        return { proposal: input };
      }
      const prompt = readFileSync(promptPath, 'utf8');
      const system = profileDirectory === undefined ? prompt : `${prompt}\n\n${readProfile(profileDirectory)}`;
      const response = await createMessage({ model, system, messages, tools: [proposeTriageTool] });
      const promptVersion = basename(promptPath, extname(promptPath));
      const costInUsd = costOf(response);
      const input = readToolUseInput(response);
      if (costInUsd !== undefined && !triageProposal.safeParse(input).success) {
        return { promptVersion, failure: { input }, costInUsd };
      }
      if (costInUsd !== undefined) {
        return { promptVersion, proposal: readToolUseInput(response), costInUsd };
      }
      return { promptVersion };
    },
  };
}
