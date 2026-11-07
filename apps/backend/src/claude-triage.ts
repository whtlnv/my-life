import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { triageProposal } from '@my-life/contracts';
import { isAddressedToUser } from '@my-life/domain';

interface ClaudeResponse {
  content: { type: string; input?: unknown }[];
  usage: { input_tokens: number; output_tokens: number };
}

export interface TriagePricing {
  inputPerMillionTokensInUsd: number;
  outputPerMillionTokensInUsd: number;
}

interface ClaudeTriageDependencies {
  model: string;
  promptPath: string;
  profileDirectory?: string;
  pricing: TriagePricing;
  createMessage: (request: {
    model: string;
    system: string;
    messages: { role: string; content: string }[];
    tools: { name: string; strict: boolean; input_schema: unknown }[];
  }) => Promise<ClaudeResponse>;
}

function profileFileName(accountEmail: string): string {
  const domainName = accountEmail.split('@')[1]?.split('.')[0] ?? '';
  return `${domainName}.md`;
}

function readProfile(profileDirectory: string, accountEmail: string): string {
  return readFileSync(join(profileDirectory, profileFileName(accountEmail)), 'utf8');
}

function composeSystemPrompt(promptPath: string, profileDirectory: string | undefined, accountEmail: string): string {
  const prompt = readFileSync(promptPath, 'utf8');
  return profileDirectory === undefined ? prompt : `${prompt}\n\n${readProfile(profileDirectory, accountEmail)}`;
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
  model: string;
  promptVersion: string;
  proposal?: unknown;
  failure?: { input: unknown };
  costInUsd: number;
}

const proposeTriageTool = { name: 'propose_triage', strict: true, input_schema: triageProposal.toJSONSchema() };

function readToolUseInput(response: ClaudeResponse): unknown {
  return response.content.find((block) => block.type === 'tool_use')?.input;
}

function computeCostInUsd(usage: ClaudeResponse['usage'], pricing: TriagePricing): number {
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
  const promptVersion = basename(promptPath, extname(promptPath));
  return {
    propose: async (message: TriageMessage, examples?: unknown[]): Promise<TriageOutcome> => {
      const system = composeSystemPrompt(promptPath, profileDirectory, message.accountEmail ?? '');
      const messages = [{ role: 'user', content: describeMessage(message, examples) }];
      const response = await createMessage({ model, system, messages, tools: [proposeTriageTool] });
      const costInUsd = computeCostInUsd(response.usage, pricing);
      const input = readToolUseInput(response);
      const parsed = triageProposal.safeParse(input);
      const call = { model, promptVersion, costInUsd };
      return parsed.success ? { ...call, proposal: parsed.data } : { ...call, failure: { input } };
    },
  };
}
