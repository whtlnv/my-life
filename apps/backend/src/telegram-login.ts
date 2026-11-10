import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TelegramLoginPrompts {
  phoneNumber: () => Promise<string>;
  phoneCode: () => Promise<string>;
  password: () => Promise<string>;
}

interface TelegramLoginClient {
  signIn(prompts: TelegramLoginPrompts): Promise<string>;
}

export async function runTelegramLogin(options: {
  client: TelegramLoginClient;
  ask: (question: string) => Promise<string>;
  askHidden?: (question: string) => Promise<string>;
  sessionPath: string;
}): Promise<void> {
  const askHidden = options.askHidden ?? options.ask;
  const session = await options.client.signIn({
    phoneNumber: () => options.ask('Phone number: '),
    phoneCode: () => options.ask('Code Telegram sent: '),
    password: () => askHidden('Two-step verification password: '),
  });
  // The session is a credential: it logs in as the user, so only the user may read it.
  mkdirSync(dirname(options.sessionPath), { recursive: true });
  writeFileSync(options.sessionPath, session, { mode: 0o600 });
}
