import type { FetchFunction } from './fetch-function';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';

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
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as { commands: ArchiveCommand[] };
  const { labels } = (await (await options.fetch(`${gmailApi}/labels`, { headers: authorization })).json()) as {
    labels: GmailLabel[];
  };
  const archivedLabel = labels.find((label) => label.name === 'my-life/archived');
  for (const command of commands) {
    await options.fetch(`${gmailApi}/messages/${command.messageId}/modify`, {
      method: 'POST',
      headers: authorization,
      body: JSON.stringify({ removeLabelIds: ['INBOX'], addLabelIds: [archivedLabel?.id] }),
    });
  }
}
