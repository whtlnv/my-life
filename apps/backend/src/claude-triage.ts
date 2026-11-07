import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

interface ClaudeTriageDependencies {
  model: string;
  promptPath?: string;
  profileDirectory?: string;
  createMessage: (request: { model: string; system?: string }) => Promise<unknown>;
}

function readProfile(profileDirectory: string): string {
  return readdirSync(profileDirectory)
    .map((fileName) => readFileSync(join(profileDirectory, fileName), 'utf8'))
    .join('\n\n');
}

export function createClaudeTriage({ model, promptPath, profileDirectory, createMessage }: ClaudeTriageDependencies) {
  return {
    propose: async (_message: {
      id: string;
      date: string;
      accountEmail?: string;
    }): Promise<{ promptVersion: string } | undefined> => {
      if (promptPath === undefined) {
        await createMessage({ model });
        return undefined;
      }
      const prompt = readFileSync(promptPath, 'utf8');
      const system = profileDirectory === undefined ? prompt : `${prompt}\n\n${readProfile(profileDirectory)}`;
      await createMessage({ model, system });
      return { promptVersion: basename(promptPath, extname(promptPath)) };
    },
  };
}
