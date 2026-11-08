import { refreshBadge } from './badge-refresh';
import { pollCalendarOnce } from './calendar-poll';
import { importContactsOnce } from './contacts-import';
import { carryOutArchiveCommands } from './gmail-archive';
import { carryOutFilterCommands } from './gmail-filter';
import { pollGmailOnce } from './gmail-poll';
import type { FetchFunction } from './fetch-function';

const calendarPollIntervalMilliseconds = 5 * 60 * 1000;
const gmailPollIntervalMilliseconds = 60 * 1000;
const contactsImportIntervalMilliseconds = 24 * 60 * 60 * 1000;

interface StartExtensionOptions {
  fetch: FetchFunction;
  profileAccountEmail: () => Promise<string>;
  accessToken: () => Promise<string>;
  backendUrl: string;
  clock: () => Date;
  timeZone: string;
  every?: (milliseconds: number, poll: () => Promise<void>) => void;
  setBadgeText?: (text: string) => Promise<void>;
}

export async function startExtension(options: StartExtensionOptions): Promise<void> {
  const accountEmail = await options.profileAccountEmail();
  await options.fetch(`${options.backendUrl}/register`, {
    method: 'POST',
    body: JSON.stringify({ email: accountEmail }),
  });
  const pollCalendar = async () => {
    await pollCalendarOnce({
      fetch: options.fetch,
      accessToken: await options.accessToken(),
      accountEmail,
      backendUrl: options.backendUrl,
      now: options.clock(),
      timeZone: options.timeZone,
    });
    if (options.setBadgeText) {
      await refreshBadge({ fetch: options.fetch, backendUrl: options.backendUrl, setBadgeText: options.setBadgeText });
    }
  };
  let storedHistoryId: string | undefined;
  const pollGmail = async () => {
    const accessToken = await options.accessToken();
    storedHistoryId = await pollGmailOnce({
      fetch: options.fetch,
      accessToken,
      accountEmail,
      backendUrl: options.backendUrl,
      storedHistoryId,
    });
    const commandOptions = { fetch: options.fetch, accessToken, accountEmail, backendUrl: options.backendUrl };
    await carryOutArchiveCommands(commandOptions);
    await carryOutFilterCommands(commandOptions);
  };
  const pollGmailAndLogFailure = () =>
    pollGmail().catch((error: unknown) => {
      console.error('Gmail poll failed', error);
    });
  const importContacts = async () => {
    await importContactsOnce({
      fetch: options.fetch,
      accessToken: await options.accessToken(),
      accountEmail,
      backendUrl: options.backendUrl,
    });
  };
  const importContactsAndLogFailure = () =>
    importContacts().catch((error: unknown) => {
      console.error('Contacts import failed', error);
    });
  await pollCalendar();
  await pollGmailAndLogFailure();
  await importContactsAndLogFailure();
  options.every?.(gmailPollIntervalMilliseconds, pollGmailAndLogFailure);
  options.every?.(contactsImportIntervalMilliseconds, importContactsAndLogFailure);
  options.every?.(calendarPollIntervalMilliseconds, () => pollCalendar().catch(() => undefined));
}
