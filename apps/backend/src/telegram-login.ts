import { writeFileSync } from 'node:fs';

interface TelegramLoginClient {
  signIn(prompts: { phoneNumber: () => Promise<string>; phoneCode: () => Promise<string> }): Promise<string>;
}

export async function runTelegramLogin(options: {
  client: TelegramLoginClient;
  ask: (question: string) => Promise<string>;
  sessionPath: string;
}): Promise<void> {
  const session = await options.client.signIn({
    phoneNumber: () => options.ask('Phone number: '),
    phoneCode: () => options.ask('Code Telegram sent: '),
  });
  writeFileSync(options.sessionPath, session);
}
