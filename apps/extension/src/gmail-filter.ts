import type { FetchFunction } from './fetch-function';
import { findOrCreateLabelId, type CommandOptions } from './gmail-archive';
import { gmailApi } from './gmail-api';

interface CreateFilterCommand {
  id: string;
  type: 'create-filter';
  criteria: Record<string, string>;
  labelName: string;
}

interface DeleteFilterCommand {
  id: string;
  type: 'delete-filter';
  gmailFilterId: string;
}

export async function carryOutFilterCommands(options: CommandOptions) {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as {
    commands: (CreateFilterCommand | DeleteFilterCommand | { id: string; type?: undefined })[];
  };
  for (const command of commands) {
    if (command.type === 'delete-filter') {
      await deleteGmailFilter(options.fetch, authorization, command);
      await acknowledgeCommand(options, command.id);
      continue;
    }
    if (command.type !== 'create-filter') continue;
    const gmailFilterId = await createGmailFilter(options.fetch, authorization, command);
    if (gmailFilterId === undefined) continue;
    await acknowledgeCommand(options, command.id, JSON.stringify({ gmailFilterId }));
  }
}

async function acknowledgeCommand(options: CommandOptions, commandId: string, body?: string) {
  await options.fetch(`${options.backendUrl}/commands/${commandId}/acknowledgement`, {
    method: 'POST',
    ...(body === undefined ? {} : { body }),
  });
}

async function deleteGmailFilter(
  fetch: FetchFunction,
  authorization: { Authorization: string },
  command: DeleteFilterCommand,
) {
  await fetch(`${gmailApi}/settings/filters/${command.gmailFilterId}`, { method: 'DELETE', headers: authorization });
}

async function createGmailFilter(
  fetch: FetchFunction,
  authorization: { Authorization: string },
  command: CreateFilterCommand,
) {
  const labelId = await findOrCreateLabelId(fetch, authorization, command.labelName);
  const response = await fetch(`${gmailApi}/settings/filters`, {
    method: 'POST',
    headers: authorization,
    body: JSON.stringify({
      criteria: command.criteria,
      action: { addLabelIds: [labelId], removeLabelIds: ['INBOX'] },
    }),
  });
  if (!response.ok) return undefined;
  const createdFilter = (await response.json()) as { id: string };
  return createdFilter.id;
}
