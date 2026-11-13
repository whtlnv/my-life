import { messageBody, type MessagePart } from '@my-life/domain';
import type { FetchFunction } from './fetch-function';
import { gmailApi } from './gmail-api';

const maximumRetries = 4;
const messageReadsInFlight = 10;

interface PollGmailOptions {
  fetch: FetchFunction;
  wait?: (milliseconds: number) => Promise<void>;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
  storedHistoryId?: string | undefined;
}

interface GmailProfile {
  historyId: string;
}

interface GmailMessageList {
  messages: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: MessagePart & { headers: { name: string; value: string }[] };
}

function isRetryable(response: Response) {
  return response.status === 429 || response.status >= 500;
}

async function fetchGmail(options: PollGmailOptions, url: string) {
  const authorization = { headers: { Authorization: `Bearer ${options.accessToken}` } };
  let response = await options.fetch(url, authorization);
  for (let attempt = 0; attempt < maximumRetries && isRetryable(response); attempt++) {
    await options.wait?.(1000 * 2 ** attempt);
    response = await options.fetch(url, authorization);
  }
  return response;
}

async function fetchGmailJson<ResponseBody>(options: PollGmailOptions, url: string): Promise<ResponseBody> {
  const response = await fetchGmail(options, url);
  if (!response.ok) {
    throw new Error(`Gmail read failed with ${String(response.status)}`);
  }
  return (await response.json()) as ResponseBody;
}

function toReportedMessage(message: GmailMessage) {
  const header = (name: string) => message.payload.headers.find((candidate) => candidate.name === name)?.value;
  return {
    id: message.id,
    threadId: message.threadId,
    from: header('From'),
    to: header('To'),
    cc: header('Cc'),
    subject: header('Subject'),
    date: header('Date'),
    snippet: message.snippet,
    listId: header('List-Id'),
    body: messageBody(message.payload),
    sentByUser: message.labelIds.includes('SENT'),
  };
}

async function fetchReportedMessage(options: PollGmailOptions, messageId: string) {
  const message = await fetchGmailJson<GmailMessage>(options, `${gmailApi}/messages/${messageId}?format=full`);
  return toReportedMessage(message);
}

interface GmailHistoryList {
  history?: { messagesAdded: { message: { id: string } }[] }[];
}

async function fetchMessagesAddedSince(options: PollGmailOptions, startHistoryId: string) {
  const response = await fetchGmail(options, `${gmailApi}/history?startHistoryId=${startHistoryId}`);
  if (response.status === 404) {
    return fetchInboxMessages(options);
  }
  const list = (await response.json()) as GmailHistoryList;
  const messages = [];
  for (const { messagesAdded } of list.history ?? []) {
    for (const { message: added } of messagesAdded) {
      messages.push(await fetchReportedMessage(options, added.id));
    }
  }
  return messages;
}

async function fetchReportedMessagesInBatches(options: PollGmailOptions, listed: { id: string }[]) {
  const messages = [];
  for (let start = 0; start < listed.length; start += messageReadsInFlight) {
    const batch = listed.slice(start, start + messageReadsInFlight);
    messages.push(...(await Promise.all(batch.map(({ id }) => fetchReportedMessage(options, id)))));
  }
  return messages;
}

async function fetchInboxMessages(options: PollGmailOptions) {
  const messages = [];
  let pageToken: string | undefined;
  do {
    const pageQuery = pageToken === undefined ? '' : `&pageToken=${pageToken}`;
    const list = await fetchGmailJson<GmailMessageList>(options, `${gmailApi}/messages?labelIds=INBOX${pageQuery}`);
    messages.push(...(await fetchReportedMessagesInBatches(options, list.messages)));
    pageToken = list.nextPageToken;
  } while (pageToken !== undefined);
  return messages;
}

export async function pollGmailOnce(options: PollGmailOptions): Promise<string | undefined> {
  const profile = await fetchGmailJson<GmailProfile>(options, `${gmailApi}/profile`);
  const messages =
    options.storedHistoryId === undefined
      ? await fetchInboxMessages(options)
      : await fetchMessagesAddedSince(options, options.storedHistoryId);
  const report = await options.fetch(`${options.backendUrl}/mail-report`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, historyId: profile.historyId, messages }),
  });
  if (!report.ok) {
    console.error(`Mail report for ${options.accountEmail} refused with ${String(report.status)}`);
    return options.storedHistoryId;
  }
  return profile.historyId;
}
