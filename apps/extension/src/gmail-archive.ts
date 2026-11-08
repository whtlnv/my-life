import type { FetchFunction } from './fetch-function';
import { gmailApi } from './gmail-api';

const archivedLabelName = 'my-life/archived';

export interface CommandOptions {
  fetch: FetchFunction;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
}

interface ArchiveCommand {
  id: string;
  messageId: string;
  label?: string;
}

// GET /commands lists every command kind for the account; filter commands carry no messageId.
type ListedCommand = Omit<ArchiveCommand, 'messageId'> & { messageId?: string };

interface GmailLabel {
  id: string;
  name: string;
}

export async function carryOutArchiveCommands(options: CommandOptions) {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const commands = await fetchPendingArchiveCommands(options);
  for (const command of commands) {
    const labelId = await findOrCreateLabelId(options.fetch, authorization, command.label ?? archivedLabelName);
    const archiveResponse = await archiveMessage(options.fetch, authorization, command.messageId, labelId);
    if (!archiveResponse.ok) {
      continue;
    }
    await acknowledgeCommand(options, command.id);
  }
}

async function acknowledgeCommand(options: CommandOptions, commandId: string) {
  await options.fetch(`${options.backendUrl}/commands/${commandId}/acknowledgement`, { method: 'POST' });
}

async function archiveMessage(
  fetch: FetchFunction,
  authorization: { Authorization: string },
  messageId: string,
  labelId: string,
) {
  return fetch(`${gmailApi}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: authorization,
    body: JSON.stringify({ removeLabelIds: ['INBOX'], addLabelIds: [labelId] }),
  });
}

async function fetchPendingArchiveCommands(options: CommandOptions) {
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as { commands: ListedCommand[] };
  return commands.filter((command): command is ArchiveCommand => command.messageId !== undefined);
}

export async function findOrCreateLabelId(
  fetch: FetchFunction,
  authorization: { Authorization: string },
  labelName: string,
) {
  const { labels } = (await (await fetch(`${gmailApi}/labels`, { headers: authorization })).json()) as {
    labels: GmailLabel[];
  };
  const existingLabel = labels.find((label) => label.name === labelName);
  if (existingLabel !== undefined) {
    return existingLabel.id;
  }
  const createdLabel = (await (
    await fetch(`${gmailApi}/labels`, {
      method: 'POST',
      headers: authorization,
      body: JSON.stringify({ name: labelName }),
    })
  ).json()) as GmailLabel;
  return createdLabel.id;
}
