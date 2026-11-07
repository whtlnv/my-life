import type { FetchFunction } from './fetch-function';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface PollGmailOptions {
  fetch: FetchFunction;
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
  payload: { headers: { name: string; value: string }[] };
}

async function fetchGmailJson<ResponseBody>(options: PollGmailOptions, url: string): Promise<ResponseBody> {
  const response = await options.fetch(url, { headers: { Authorization: `Bearer ${options.accessToken}` } });
  return (await response.json()) as ResponseBody;
}

function toReportedMessage(message: GmailMessage) {
  const subject = message.payload.headers.find((header) => header.name === 'Subject')?.value;
  return { id: message.id, threadId: message.threadId, subject };
}

interface GmailHistoryList {
  history: { messagesAdded: { message: { id: string } }[] }[];
}

async function fetchMessagesAddedSince(options: PollGmailOptions, startHistoryId: string) {
  const list = await fetchGmailJson<GmailHistoryList>(options, `${gmailApi}/history?startHistoryId=${startHistoryId}`);
  const messages = [];
  for (const { messagesAdded } of list.history) {
    for (const { message: added } of messagesAdded) {
      const message = await fetchGmailJson<GmailMessage>(options, `${gmailApi}/messages/${added.id}`);
      messages.push(toReportedMessage(message));
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
      const message = await fetchGmailJson<GmailMessage>(options, `${gmailApi}/messages/${id}`);
      messages.push(toReportedMessage(message));
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
