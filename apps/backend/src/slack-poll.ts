import type { SlackMessageStore } from './slack-message-store';

type SlackWorkspace = { teamId: string; userToken: string };

type PollSlackWorkspaceInput = {
  fetch: typeof fetch;
  apiUrl: string;
  workspace: SlackWorkspace;
  store: SlackMessageStore;
};

async function callSlack<Response>(input: PollSlackWorkspaceInput, path: string): Promise<Response> {
  const response = await input.fetch(`${input.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${input.workspace.userToken}` },
  });
  return (await response.json()) as Response;
}

async function fetchOwnSlackUserId(input: PollSlackWorkspaceInput): Promise<string> {
  const { user_id: ownSlackUserId } = await callSlack<{ user_id: string }>(input, '/auth.test');
  return ownSlackUserId;
}

type SlackMessage = { user: string; text: string; ts: string };

async function searchSlackMessages<Match>(input: PollSlackWorkspaceInput, query: string): Promise<Match[]> {
  const { messages } = await callSlack<{ messages: { matches: Match[] } }>(
    input,
    `/search.messages?query=${encodeURIComponent(query)}`,
  );
  return messages.matches;
}

function saveSlackMessage(input: PollSlackWorkspaceInput, conversationId: string, message: SlackMessage): void {
  input.store.saveMessage({
    workspaceTeamId: input.workspace.teamId,
    conversationId,
    senderUserId: message.user,
    text: message.text,
    timestamp: message.ts,
  });
}

function newestStoredTimestampIn(store: SlackMessageStore, conversationId: string): string | undefined {
  return store
    .listMessages()
    .filter((message) => message.conversationId === conversationId)
    .map((message) => message.timestamp)
    .sort()
    .at(-1);
}

function oldestParameterFor(store: SlackMessageStore, conversationId: string): string {
  const newestStoredTimestamp = newestStoredTimestampIn(store, conversationId);
  return newestStoredTimestamp === undefined ? '' : `&oldest=${newestStoredTimestamp}`;
}

async function pollDirectMessages(input: PollSlackWorkspaceInput): Promise<void> {
  const { channels } = await callSlack<{ channels: { id: string }[] }>(input, '/conversations.list?types=im');
  for (const channel of channels) {
    const oldestParameter = oldestParameterFor(input.store, channel.id);
    const { messages } = await callSlack<{ messages: SlackMessage[] }>(
      input,
      `/conversations.history?channel=${channel.id}${oldestParameter}`,
    );
    for (const message of messages) {
      saveSlackMessage(input, channel.id, message);
    }
  }
}

async function pollMentions(input: PollSlackWorkspaceInput): Promise<void> {
  const ownSlackUserId = await fetchOwnSlackUserId(input);
  const mentionsQuery = `<@${ownSlackUserId}>`;
  const matches = await searchSlackMessages<SlackMessage & { channel: { id: string } }>(input, mentionsQuery);
  for (const match of matches) {
    saveSlackMessage(input, match.channel.id, match);
  }
}

async function pollThreadsTheUserWroteIn(input: PollSlackWorkspaceInput): Promise<void> {
  const ownSlackUserId = await fetchOwnSlackUserId(input);
  const ownMessagesQuery = `from:<@${ownSlackUserId}>`;
  const matches = await searchSlackMessages<{ thread_ts?: string; channel: { id: string } }>(input, ownMessagesQuery);
  for (const match of matches) {
    if (match.thread_ts === undefined) {
      continue;
    }
    const oldestParameter = oldestParameterFor(input.store, match.channel.id);
    const { messages: replies } = await callSlack<{ messages: SlackMessage[] }>(
      input,
      `/conversations.replies?channel=${match.channel.id}&ts=${match.thread_ts}${oldestParameter}`,
    );
    for (const reply of replies) {
      saveSlackMessage(input, match.channel.id, reply);
    }
  }
}

export async function pollSlackWorkspace(input: PollSlackWorkspaceInput): Promise<void> {
  await pollDirectMessages(input);
  await pollMentions(input);
  await pollThreadsTheUserWroteIn(input);
}
