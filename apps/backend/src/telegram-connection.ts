import { existsSync, readFileSync } from 'node:fs';

import { TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

import { createGramjsTelegramClient } from './gramjs-telegram-client';

interface TelegramConnectionSettings {
  apiId: number;
  apiHash: string;
  sessionPath: string;
}

// gramjs's client over the session `scripts/telegram-login.sh` saved. Building it does not touch the network.
export function createGramjsClient({ apiId, apiHash, sessionPath }: TelegramConnectionSettings): TelegramClient {
  const savedSession = existsSync(sessionPath) ? readFileSync(sessionPath, 'utf8').trim() : '';
  const session = new StringSession(savedSession);
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
  client.setLogLevel(LogLevel.ERROR);
  return client;
}

// The shipped Telegram client: connected, behind the adapter, reporting whether gramjs is still connected.
export async function connectTelegram(settings: TelegramConnectionSettings) {
  const gramjsClient = createGramjsClient(settings);
  await gramjsClient.connect();
  return { ...createGramjsTelegramClient(gramjsClient), isConnected: () => gramjsClient.connected === true };
}
