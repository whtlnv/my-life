import { acknowledgeCommand, type CommandOptions } from './gmail-archive';
import { gmailApi } from './gmail-api';

interface CreateDraftCommand {
  id: string;
  type: 'create-draft';
  threadId: string;
  to: string[];
  subject: string;
  body: string;
}

export async function carryOutDraftCommands(options: CommandOptions) {
  for (const command of await fetchPendingDraftCommands(options)) {
    const response = await createGmailDraft(options, command);
    if (response.ok) await acknowledgeCommand(options, command.id);
  }
}

async function fetchPendingDraftCommands(options: CommandOptions) {
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as {
    commands: (CreateDraftCommand | { id: string; type?: string })[];
  };
  return commands.filter((command): command is CreateDraftCommand => command.type === 'create-draft');
}

async function createGmailDraft(options: CommandOptions, command: CreateDraftCommand) {
  const rawMessage = [`To: ${command.to.join(', ')}`, `Subject: ${command.subject}`, '', command.body].join('\r\n');
  return options.fetch(`${gmailApi}/drafts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.accessToken}` },
    body: JSON.stringify({
      message: { threadId: command.threadId, raw: Buffer.from(rawMessage, 'utf8').toString('base64url') },
    }),
  });
}
