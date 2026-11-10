import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runTelegramLogin, type TelegramLoginPrompts } from './telegram-login';

describe('runTelegramLogin', () => {
  it('asks for the phone number, then the code Telegram sent, and writes the session file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'my-life-'));
    try {
      const sessionPath = join(directory, 'telegram-session');
      const answers = ['+5215512345678', '24680'];
      const received: string[] = [];
      const client = {
        signIn: async (prompts: TelegramLoginPrompts) => {
          received.push(await prompts.phoneNumber());
          received.push(await prompts.phoneCode());
          return 'saved-session-string';
        },
      };

      await runTelegramLogin({ client, ask: () => Promise.resolve(answers.shift() ?? ''), sessionPath });

      expect(received).toEqual(['+5215512345678', '24680']);
      expect(readFileSync(sessionPath, 'utf8')).toBe('saved-session-string');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('asks for the 2FA password before writing the session file when the account has one', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'my-life-'));
    try {
      const sessionPath = join(directory, 'telegram-session');
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

      await runTelegramLogin({ client, ask: () => Promise.resolve(answers.shift() ?? ''), sessionPath });

      expect(received).toEqual(['+5215512345678', '24680', 'correct horse battery staple']);
      expect(readFileSync(sessionPath, 'utf8')).toBe('saved-session-string');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
