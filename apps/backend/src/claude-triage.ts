import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { isAddressedToUser } from '@my-life/domain';

interface ClaudeTriageDependencies {
  model: string;
  promptPath?: string;
  profileDirectory?: string;
  createMessage: (request: {
    model: string;
    system?: string;
    messages: { role: string; content: string }[];
  }) => Promise<unknown>;
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

export function createClaudeTriage({ model, promptPath, profileDirectory, createMessage }: ClaudeTriageDependencies) {
  return {
    propose: async (message: TriageMessage, examples?: unknown[]): Promise<{ promptVersion: string } | undefined> => {
      const messages = [{ role: 'user', content: describeMessage(message, examples) }];
      if (promptPath === undefined) {
        await createMessage({ model, messages });
        return undefined;
      }
      const prompt = readFileSync(promptPath, 'utf8');
      const system = profileDirectory === undefined ? prompt : `${prompt}\n\n${readProfile(profileDirectory)}`;
      await createMessage({ model, system, messages });
      return { promptVersion: basename(promptPath, extname(promptPath)) };
    },
  };
}
