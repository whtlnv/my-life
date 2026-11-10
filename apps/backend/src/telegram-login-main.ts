import { homedir } from 'node:os';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { createGramjsTelegramClient } from './gramjs-telegram-client';
import { readTelegramSettings } from './startup-settings';
import { createGramjsClient } from './telegram-connection';
import { runTelegramLogin } from './telegram-login';

// `scripts/telegram-login.sh`: the one-time Telegram login (PENDING_TASKS.md § 6). Asks on the terminal, writes the
// session file the backend then starts Telegram from. Run it in your own terminal: it needs a keyboard.
const settings = readTelegramSettings(process.env, homedir());
const apiHash = settings.apiHash;
if (apiHash === undefined || !Number.isInteger(settings.apiId)) {
  console.error('Set MY_LIFE_TELEGRAM_API_ID and MY_LIFE_TELEGRAM_API_HASH in .env first.');
  process.exit(1);
}

const terminal = createInterface({ input: stdin, output: stdout });
const ask = (question: string) => terminal.question(question);

// The typed password is not echoed: readline's own output is muted while it is read.
async function askHidden(question: string): Promise<string> {
  stdout.write(question);
  const write = stdout.write.bind(stdout);
  stdout.write = (() => true) as typeof stdout.write;
  try {
    return await terminal.question('');
  } finally {
    stdout.write = write;
    stdout.write('\n');
  }
}

const gramjsClient = createGramjsClient({ apiId: settings.apiId, apiHash, sessionPath: settings.sessionPath });
try {
  await runTelegramLogin({
    client: createGramjsTelegramClient(gramjsClient),
    ask,
    askHidden,
    sessionPath: settings.sessionPath,
  });
  console.log(`Logged in. Session saved to ${settings.sessionPath}; restart the backend to start Telegram.`);
} finally {
  terminal.close();
  await gramjsClient.disconnect();
}
process.exit(0);
