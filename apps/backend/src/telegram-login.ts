import { writeFileSync } from 'node:fs';

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
  sessionPath: string;
}): Promise<void> {
  const session = await options.client.signIn({
    phoneNumber: () => options.ask('Phone number: '),
    phoneCode: () => options.ask('Code Telegram sent: '),
    password: () => options.ask('Two-step verification password: '),
  });
  writeFileSync(options.sessionPath, session);
}
