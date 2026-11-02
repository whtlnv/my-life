import { pollCalendarOnce } from './calendar-poll';

type StartExtensionOptions = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  profileAccountEmail: () => Promise<string>;
  accessToken: () => Promise<string>;
  backendUrl: string;
  now: Date;
  timeZone: string;
};

export async function startExtension(options: StartExtensionOptions): Promise<void> {
  const accountEmail = await options.profileAccountEmail();
  await options.fetch(`${options.backendUrl}/register`, {
    method: 'POST',
    body: JSON.stringify({ email: accountEmail }),
  });
  await pollCalendarOnce({
    fetch: options.fetch,
    accessToken: await options.accessToken(),
    accountEmail,
    backendUrl: options.backendUrl,
    now: options.now,
    timeZone: options.timeZone,
  });
}
