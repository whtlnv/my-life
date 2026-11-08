import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { triageProposal } from '@my-life/contracts';
import { isAddressedToUser } from '@my-life/domain';

export interface ClaudeResponse {
  content: { type: string; input?: unknown }[];
  usage: { input_tokens: number; output_tokens: number };
}

export interface ClaudeRequest {
  model: string;
  system: string;
  messages: { role: string; content: string }[];
  tools: { name: string; strict: boolean; input_schema: unknown }[];
}

export interface ClaudePricing {
  inputPerMillionTokensInUsd: number;
  outputPerMillionTokensInUsd: number;
}

interface ClaudeTriageDependencies {
  model: string;
  promptPath: string;
  profileDirectory?: string;
  pricing: ClaudePricing;
  createMessage: (request: ClaudeRequest) => Promise<ClaudeResponse>;
}

function profileFileName(accountEmail: string): string {
  const domainName = accountEmail.split('@')[1]?.split('.')[0] ?? '';
  return `${domainName}.md`;
}

function readOptionalFile(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function readProfile(profileDirectory: string, accountEmail: string): string {
  const sharedProfile = readOptionalFile(join(profileDirectory, 'accounts.md'));
  const accountProfile = readOptionalFile(join(profileDirectory, profileFileName(accountEmail)));
  return [sharedProfile, accountProfile].filter((part) => part !== undefined).join('\n\n');
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
  body?: string;
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
    body: message.body,
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

export function readToolUseInput(response: ClaudeResponse): unknown {
  return response.content.find((block) => block.type === 'tool_use')?.input;
}

export function computeCostInUsd(usage: ClaudeResponse['usage'], pricing: ClaudePricing): number {
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
