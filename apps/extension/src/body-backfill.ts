import { messageBody, type MessagePart } from '@my-life/domain';
import type { AccountRequestOptions } from './fetch-function';
import { gmailApi } from './gmail-api';

interface BodiesMissing {
  messageIds: string[];
}

interface GmailMessage {
  payload: MessagePart;
}

async function fetchMessageBody(options: AccountRequestOptions, messageId: string): Promise<string> {
  const response = await options.fetch(`${gmailApi}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });
  const message = (await response.json()) as GmailMessage;
  return messageBody(message.payload);
}

async function fetchMissingMessageIds(options: AccountRequestOptions): Promise<string[]> {
  const missingUrl = new URL(`${options.backendUrl}/bodies-missing`);
  missingUrl.searchParams.set('account', options.accountEmail);
  const response = await options.fetch(missingUrl);
  const missing = (await response.json()) as BodiesMissing;
  return missing.messageIds;
}

export async function backfillBodiesOnce(options: AccountRequestOptions): Promise<void> {
  const bodies = [];
  for (const messageId of await fetchMissingMessageIds(options)) {
    bodies.push({ messageId, body: await fetchMessageBody(options, messageId) });
  }
  await options.fetch(`${options.backendUrl}/bodies-report`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, bodies }),
  });
}
