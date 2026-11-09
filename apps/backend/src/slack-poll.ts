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

type SlackMessage = { user: string; text: string; ts: string };

function saveSlackMessage(input: PollSlackWorkspaceInput, conversationId: string, message: SlackMessage): void {
  input.store.saveMessage({
    workspaceTeamId: input.workspace.teamId,
    conversationId,
    senderUserId: message.user,
    text: message.text,
    timestamp: message.ts,
  });
}

async function pollDirectMessages(input: PollSlackWorkspaceInput): Promise<void> {
  const { channels } = await callSlack<{ channels: { id: string }[] }>(input, '/conversations.list');
  for (const channel of channels) {
    const { messages } = await callSlack<{ messages: SlackMessage[] }>(
      input,
      `/conversations.history?channel=${channel.id}`,
    );
    for (const message of messages) {
      saveSlackMessage(input, channel.id, message);
    }
  }
}

async function pollMentions(input: PollSlackWorkspaceInput): Promise<void> {
  const { messages } = await callSlack<{
    messages: { matches: (SlackMessage & { channel: { id: string } })[] };
  }>(input, '/search.messages');
  for (const match of messages.matches) {
    saveSlackMessage(input, match.channel.id, match);
  }
}

async function searchOwnMessages(input: PollSlackWorkspaceInput): Promise<void> {
  await callSlack(input, `/search.messages?query=${encodeURIComponent('from:<@U0000>')}`);
}

export async function pollSlackWorkspace(input: PollSlackWorkspaceInput): Promise<void> {
  await pollDirectMessages(input);
  await pollMentions(input);
  await searchOwnMessages(input);
}
