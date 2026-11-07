import type { FetchFunction } from './fetch-function';
import { findOrCreateLabelId } from './gmail-archive';
import { gmailApi } from './gmail-api';

interface CarryOutFilterCommandsOptions {
  fetch: FetchFunction;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
}

interface CreateFilterCommand {
  id: string;
  type: string;
  criteria: Record<string, string>;
  labelName: string;
}

export async function carryOutFilterCommands(options: CarryOutFilterCommandsOptions) {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as { commands: CreateFilterCommand[] };
  for (const command of commands.filter(({ type }) => type === 'create-filter')) {
    const gmailFilterId = await createGmailFilter(options.fetch, authorization, command);
    if (gmailFilterId === undefined) continue;
    await options.fetch(`${options.backendUrl}/commands/${command.id}/acknowledgement`, {
      method: 'POST',
      body: JSON.stringify({ gmailFilterId }),
    });
  }
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
