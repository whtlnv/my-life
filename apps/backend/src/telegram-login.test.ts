import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runTelegramLogin, type TelegramLoginPrompts } from './telegram-login';

async function withSessionPath(run: (sessionPath: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'my-life-'));
  try {
    await run(join(directory, 'telegram-session'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function scriptedAsk(answers: string[]): () => Promise<string> {
  return () => Promise.resolve(answers.shift() ?? '');
}

describe('runTelegramLogin', () => {
  it('asks for the phone number, then the code Telegram sent, and writes the session file', async () => {
    await withSessionPath(async (sessionPath) => {
      const answers = ['+5215512345678', '24680'];
      const received: string[] = [];
      const client = {
        signIn: async (prompts: TelegramLoginPrompts) => {
          received.push(await prompts.phoneNumber());
          received.push(await prompts.phoneCode());
          return 'saved-session-string';
        },
      };

      await runTelegramLogin({ client, ask: scriptedAsk(answers), sessionPath });

      expect(received).toEqual(['+5215512345678', '24680']);
      expect(readFileSync(sessionPath, 'utf8')).toBe('saved-session-string');
    });
  });

  it('asks for the 2FA password before writing the session file when the account has one', async () => {
    await withSessionPath(async (sessionPath) => {
      const answers = ['+5215512345678', '24680', 'correct horse battery staple'];
      const received: string[] = [];
      const client = {
        signIn: async (prompts: TelegramLoginPrompts) => {
          received.push(await prompts.phoneNumber());
          received.push(await prompts.phoneCode());
          received.push(await prompts.password());
          return 'saved-session-string';
        },
      };

      await runTelegramLogin({ client, ask: scriptedAsk(answers), sessionPath });

      expect(received).toEqual(['+5215512345678', '24680', 'correct horse battery staple']);
      expect(readFileSync(sessionPath, 'utf8')).toBe('saved-session-string');
    });
  });

  it('does not ask for a 2FA password when the account has none', async () => {
    await withSessionPath(async (sessionPath) => {
      const answer = scriptedAsk(['+5215512345678', '24680']);
      const questions: string[] = [];
      const ask = (question: string) => {
        questions.push(question);
        return answer();
      };
      const client = {
        signIn: async (prompts: TelegramLoginPrompts) => {
          await prompts.phoneNumber();
          await prompts.phoneCode();
          return 'saved-session-string';
        },
      };

      await runTelegramLogin({ client, ask, sessionPath });

      expect(questions).toHaveLength(2);
      expect(readFileSync(sessionPath, 'utf8')).toBe('saved-session-string');
    });
  });

  it('creates the session folder and writes the session file readable only by the user', async () => {
    await withSessionPath(async (sessionPath) => {
      const nestedSessionPath = join(sessionPath, 'my-life', 'telegram-session');
      const client = { signIn: () => Promise.resolve('saved-session-string') };

      await runTelegramLogin({ client, ask: scriptedAsk([]), sessionPath: nestedSessionPath });

      expect(readFileSync(nestedSessionPath, 'utf8')).toBe('saved-session-string');
      expect(statSync(nestedSessionPath).mode & 0o777).toBe(0o600);
    });
  });
});
