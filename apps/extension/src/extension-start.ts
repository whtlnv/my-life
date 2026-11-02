import { pollCalendarOnce } from './calendar-poll';

const calendarPollIntervalMilliseconds = 5 * 60 * 1000;

type StartExtensionOptions = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  profileAccountEmail: () => Promise<string>;
  accessToken: () => Promise<string>;
  backendUrl: string;
  now: Date;
  clock?: () => Date;
  timeZone: string;
  every?: (milliseconds: number, poll: () => Promise<void>) => void;
};

export async function startExtension(options: StartExtensionOptions): Promise<void> {
  const accountEmail = await options.profileAccountEmail();
  await options.fetch(`${options.backendUrl}/register`, {
    method: 'POST',
    body: JSON.stringify({ email: accountEmail }),
  });
  const poll = async () =>
    pollCalendarOnce({
      fetch: options.fetch,
      accessToken: await options.accessToken(),
      accountEmail,
      backendUrl: options.backendUrl,
      now: options.clock ? options.clock() : options.now,
      timeZone: options.timeZone,
    });
  await poll();
  options.every?.(calendarPollIntervalMilliseconds, () => poll().catch(() => undefined));
}
