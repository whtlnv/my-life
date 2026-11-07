import type { FetchFunction } from './fetch-function';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface PollGmailOptions {
  fetch: FetchFunction;
  wait?: (milliseconds: number) => Promise<void>;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
  storedHistoryId: string | undefined;
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
  snippet: string;
  payload: { headers: { name: string; value: string }[] };
}

async function fetchGmail(options: PollGmailOptions, url: string) {
  const authorization = { headers: { Authorization: `Bearer ${options.accessToken}` } };
  let response = await options.fetch(url, authorization);
  for (let attempt = 0; response.status === 429 || response.status >= 500; attempt++) {
    await options.wait?.(1000 * 2 ** attempt);
    response = await options.fetch(url, authorization);
  }
  return response;
}

async function fetchGmailJson<ResponseBody>(options: PollGmailOptions, url: string): Promise<ResponseBody> {
  const response = await fetchGmail(options, url);
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
  };
}

async function fetchReportedMessage(options: PollGmailOptions, messageId: string) {
  const message = await fetchGmailJson<GmailMessage>(options, `${gmailApi}/messages/${messageId}?format=metadata`);
  return toReportedMessage(message);
}

interface GmailHistoryList {
  history: { messagesAdded: { message: { id: string } }[] }[];
}

async function fetchMessagesAddedSince(options: PollGmailOptions, startHistoryId: string) {
  const response = await fetchGmail(options, `${gmailApi}/history?startHistoryId=${startHistoryId}`);
  if (response.status === 404) {
    return fetchInboxMessages(options);
  }
  const list = (await response.json()) as GmailHistoryList;
  const messages = [];
  for (const { messagesAdded } of list.history) {
    for (const { message: added } of messagesAdded) {
      messages.push(await fetchReportedMessage(options, added.id));
    }
  }
  return messages;
}

async function fetchInboxMessages(options: PollGmailOptions) {
  const messages = [];
  let pageToken: string | undefined;
  do {
    const pageQuery = pageToken === undefined ? '' : `&pageToken=${pageToken}`;
    const list = await fetchGmailJson<GmailMessageList>(options, `${gmailApi}/messages?labelIds=INBOX${pageQuery}`);
    for (const { id } of list.messages) {
      messages.push(await fetchReportedMessage(options, id));
    }
    pageToken = list.nextPageToken;
  } while (pageToken !== undefined);
  return messages;
}

export async function pollGmailOnce(options: PollGmailOptions): Promise<void> {
  const profile = await fetchGmailJson<GmailProfile>(options, `${gmailApi}/profile`);
  const messages =
    options.storedHistoryId === undefined
      ? await fetchInboxMessages(options)
      : await fetchMessagesAddedSince(options, options.storedHistoryId);
  await options.fetch(`${options.backendUrl}/mail-report`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, historyId: profile.historyId, messages }),
  });
}
