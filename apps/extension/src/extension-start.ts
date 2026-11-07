import { refreshBadge } from './badge-refresh';
import { pollCalendarOnce } from './calendar-poll';
import { carryOutArchiveCommands } from './gmail-archive';
import { pollGmailOnce } from './gmail-poll';
import type { FetchFunction } from './fetch-function';

const calendarPollIntervalMilliseconds = 5 * 60 * 1000;
const gmailPollIntervalMilliseconds = 60 * 1000;

interface StartExtensionOptions {
  fetch: FetchFunction;
  profileAccountEmail: () => Promise<string>;
  accessToken: () => Promise<string>;
  backendUrl: string;
  now: Date;
  clock?: () => Date;
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
  const currentTime = options.clock ?? (() => options.now);
  const pollCalendar = async () => {
    await pollCalendarOnce({
      fetch: options.fetch,
      accessToken: await options.accessToken(),
      accountEmail,
      backendUrl: options.backendUrl,
      now: currentTime(),
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
    await carryOutArchiveCommands({ fetch: options.fetch, accessToken, accountEmail, backendUrl: options.backendUrl });
  };
  const pollGmailAndLogFailure = () =>
    pollGmail().catch((error: unknown) => {
      console.error('Gmail poll failed', error);
    });
  await pollCalendar();
  await pollGmailAndLogFailure();
  options.every?.(gmailPollIntervalMilliseconds, pollGmailAndLogFailure);
  options.every?.(calendarPollIntervalMilliseconds, () => pollCalendar().catch(() => undefined));
}
