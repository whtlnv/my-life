import type { AccountRequestOptions, FetchFunction } from './fetch-function';
import { gmailApi } from './gmail-api';

const archivedLabelName = 'my-life/archived';

export type CommandOptions = AccountRequestOptions;

interface MessageCommand {
  id: string;
  messageId: string;
  label?: string;
  type?: string;
}

// GET /commands lists every command kind for the account; filter commands carry no messageId.
type ListedCommand = Omit<MessageCommand, 'messageId'> & { messageId?: string };

interface GmailLabel {
  id: string;
  name: string;
}

export async function carryOutMessageCommands(options: CommandOptions) {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const commands = await fetchPendingMessageCommands(options);
  for (const command of commands) {
    const labelId = await findOrCreateLabelId(options.fetch, authorization, command.label ?? archivedLabelName);
    const labelChanges =
      command.type === 'undo-automatic'
        ? { removeLabelIds: [labelId], addLabelIds: ['INBOX'] }
        : command.type === 'label'
          ? { removeLabelIds: [], addLabelIds: [labelId] }
          : { removeLabelIds: ['INBOX'], addLabelIds: [labelId] };
    const labelResponse = await modifyMessageLabels(options.fetch, authorization, command.messageId, labelChanges);
    if (!labelResponse.ok) {
      continue;
    }
    await acknowledgeCommand(options, command.id);
  }
}

export async function acknowledgeCommand(options: CommandOptions, commandId: string, body?: string) {
  await options.fetch(`${options.backendUrl}/commands/${commandId}/acknowledgement`, {
    method: 'POST',
    ...(body === undefined ? {} : { body }),
  });
}

async function modifyMessageLabels(
  fetch: FetchFunction,
  authorization: { Authorization: string },
  messageId: string,
  labelChanges: { removeLabelIds: string[]; addLabelIds: string[] },
) {
  return fetch(`${gmailApi}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: authorization,
    body: JSON.stringify(labelChanges),
  });
}

async function fetchPendingMessageCommands(options: CommandOptions) {
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as { commands: ListedCommand[] };
  return commands.filter((command): command is MessageCommand => command.messageId !== undefined);
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
