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

export async function pollGmailOnce(options: PollGmailOptions): Promise<void> {
  const profile = await fetchGmailJson<GmailProfile>(options, `${gmailApi}/profile`);
  const list = await fetchGmailJson<GmailMessageList>(options, `${gmailApi}/messages?labelIds=INBOX`);
  const messages = [];
  for (const { id } of list.messages) {
    const message = await fetchGmailJson<GmailMessage>(options, `${gmailApi}/messages/${id}`);
    const subject = message.payload.headers.find((header) => header.name === 'Subject')?.value;
    messages.push({ id: message.id, threadId: message.threadId, subject });
  }
  await options.fetch(`${options.backendUrl}/mail-report`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, historyId: profile.historyId, messages }),
  });
}
