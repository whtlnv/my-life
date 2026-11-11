import type { AccountRequestOptions } from './fetch-function';

interface SendWhatsappCommand {
  id: string;
  chatTitle: string;
  text: string;
}

function sendInChat(document: Document, command: SendWhatsappCommand): boolean {
  const chatRow = document.querySelector<HTMLElement>(`[data-testid="cell-frame-title"] span[title="${command.chatTitle}"]`);
  if (chatRow === null) return false;
  chatRow.click();
  const composer = document.querySelector('[data-testid="conversation-compose-box-input"]');
  if (composer === null) return false;
  composer.textContent = command.text;
  composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
}

export type WhatsappSendOptions = Omit<AccountRequestOptions, 'accessToken'> & { document: Document };

export async function carryOutWhatsappSends(options: WhatsappSendOptions) {
  const commandsUrl = `${options.backendUrl}/commands?accountEmail=${encodeURIComponent(options.accountEmail)}`;
  const { commands } = (await (await options.fetch(commandsUrl)).json()) as { commands: SendWhatsappCommand[] };
  for (const command of commands) {
    if (!sendInChat(options.document, command)) continue;
    await options.fetch(`${options.backendUrl}/commands/${command.id}/acknowledgement`, { method: 'POST' });
  }
}
