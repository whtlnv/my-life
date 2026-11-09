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

export async function pollSlackWorkspace(input: PollSlackWorkspaceInput): Promise<void> {
  const { channels } = await callSlack<{ channels: { id: string }[] }>(input, '/conversations.list');
  for (const channel of channels) {
    const { messages } = await callSlack<{ messages: { user: string; text: string; ts: string }[] }>(
      input,
      `/conversations.history?channel=${channel.id}`,
    );
    for (const message of messages) {
      input.store.saveMessage({
        workspaceTeamId: input.workspace.teamId,
        conversationId: channel.id,
        senderUserId: message.user,
        text: message.text,
        timestamp: message.ts,
      });
    }
  }
}
