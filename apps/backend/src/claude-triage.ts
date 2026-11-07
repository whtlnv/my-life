import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

interface ClaudeTriageDependencies {
  model: string;
  promptPath?: string;
  createMessage: (request: { model: string; system?: string }) => Promise<unknown>;
}

export function createClaudeTriage({ model, promptPath, createMessage }: ClaudeTriageDependencies) {
  return {
    propose: async (_message: { id: string; date: string }): Promise<{ promptVersion: string } | undefined> => {
      if (promptPath === undefined) {
        await createMessage({ model });
        return undefined;
      }
      await createMessage({ model, system: readFileSync(promptPath, 'utf8') });
      return { promptVersion: basename(promptPath, extname(promptPath)) };
    },
  };
}
