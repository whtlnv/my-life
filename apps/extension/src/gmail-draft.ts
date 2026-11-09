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
  return options.fetch(`${gmailApi}/drafts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.accessToken}` },
    body: JSON.stringify({ message: { threadId: command.threadId, raw: rawDraftMessage(command) } }),
  });
}

// Browser APIs only: the extension's service worker has no Node `Buffer`.
function utf8Base64(text: string) {
  return btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(''));
}

export function rawDraftMessage(draft: Pick<CreateDraftCommand, 'to' | 'subject' | 'body'>) {
  const message = [
    `To: ${draft.to.join(', ')}`,
    `Subject: =?UTF-8?B?${utf8Base64(draft.subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    draft.body,
  ].join('\r\n');
  return utf8Base64(message).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
