import type { FetchFunction } from './fetch-function';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';
const archivedLabelName = 'my-life/archived';

interface CarryOutArchiveCommandsOptions {
  fetch: FetchFunction;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
}

interface ArchiveCommand {
  id: string;
  kind: 'archive';
  messageId: string;
}

interface GmailLabel {
  id: string;
  name: string;
}

export async function carryOutArchiveCommands(options: CarryOutArchiveCommandsOptions) {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const commands = await fetchPendingArchiveCommands(options);
  const archivedLabelId = await findArchivedLabelId(options.fetch, authorization);
  for (const command of commands) {
    const archiveResponse = await archiveMessage(options.fetch, authorization, command.messageId, archivedLabelId);
    if (!archiveResponse.ok) {
      continue;
    }
    await options.fetch(`${options.backendUrl}/commands/${command.id}/acknowledgement`, { method: 'POST' });
  }
}

async function archiveMessage(
  fetch: FetchFunction,
  authorization: { Authorization: string },
  messageId: string,
  archivedLabelId: string,
) {
  return fetch(`${gmailApi}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: authorization,
    body: JSON.stringify({ removeLabelIds: ['INBOX'], addLabelIds: [archivedLabelId] }),
  });
}

async function fetchPendingArchiveCommands(options: CarryOutArchiveCommandsOptions) {
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as { commands: ArchiveCommand[] };
  return commands;
}

async function findArchivedLabelId(fetch: FetchFunction, authorization: { Authorization: string }) {
  const { labels } = (await (await fetch(`${gmailApi}/labels`, { headers: authorization })).json()) as {
    labels: GmailLabel[];
  };
  const existingLabel = labels.find((label) => label.name === archivedLabelName);
  if (existingLabel !== undefined) {
    return existingLabel.id;
  }
  const createdLabel = (await (
    await fetch(`${gmailApi}/labels`, {
      method: 'POST',
      headers: authorization,
      body: JSON.stringify({ name: archivedLabelName }),
    })
  ).json()) as GmailLabel;
  return createdLabel.id;
}
