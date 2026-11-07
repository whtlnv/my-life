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
  criteria: Record<string, string>;
  label: string;
}

export async function carryOutFilterCommands(options: CarryOutFilterCommandsOptions) {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as { commands: CreateFilterCommand[] };
  for (const command of commands) {
    const labelId = await findOrCreateLabelId(options.fetch, authorization, command.label);
    const createdFilter = (await (
      await options.fetch(`${gmailApi}/settings/filters`, {
        method: 'POST',
        headers: authorization,
        body: JSON.stringify({
          criteria: command.criteria,
          action: { addLabelIds: [labelId], removeLabelIds: ['INBOX'] },
        }),
      })
    ).json()) as { id: string };
    await options.fetch(`${options.backendUrl}/commands/${command.id}/acknowledgement`, {
      method: 'POST',
      body: JSON.stringify({ gmailFilterId: createdFilter.id }),
    });
  }
}
