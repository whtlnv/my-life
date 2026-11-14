import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultBackendUrl } from '../backend-url';
import background from './background';

const profileEmail = 'francisco@example.com';

interface CreatedAlarm {
  name: string;
  periodInMinutes: number | undefined;
}

const requestUrl = (input: string | URL | Request): URL =>
  new URL(input instanceof Request ? input.url : input.toString());

// A Google and backend network that answers every start-up read with an empty result, recording the notes reports.
const fakeNetwork = (notesReports: unknown[]) => (input: string | URL | Request, init?: RequestInit) => {
  const url = requestUrl(input);
  if (url.origin === defaultBackendUrl && init?.method === 'POST') {
    if (url.pathname === '/notes-report' && typeof init.body === 'string') notesReports.push(JSON.parse(init.body));
    return Promise.resolve(Response.json({ ok: true }));
  }
  if (url.origin === defaultBackendUrl && url.pathname === '/now')
    return Promise.resolve(Response.json({ badgeCount: 0 }));
  if (url.origin === defaultBackendUrl && url.pathname === '/commands')
    return Promise.resolve(Response.json({ commands: [] }));
  if (url.pathname.endsWith('/calendarList')) return Promise.resolve(Response.json({ items: [] }));
  if (url.pathname.endsWith('/drive/v3/files')) return Promise.resolve(Response.json({ files: [] }));
  if (url.pathname.endsWith('/users/me/profile')) {
    return Promise.resolve(Response.json({ emailAddress: profileEmail, historyId: '1' }));
  }
  return Promise.resolve(Response.json({}));
};

const fakeChrome = (createdAlarms: CreatedAlarm[], alarmListeners: ((alarm: { name: string }) => void)[]) => ({
  action: { onClicked: { addListener: vi.fn() }, setBadgeText: () => Promise.resolve() },
  runtime: { onMessage: { addListener: vi.fn() } },
  tabs: { create: vi.fn() },
  identity: {
    AccountStatus: { ANY: 'ANY' },
    getProfileUserInfo: () => Promise.resolve({ email: profileEmail, id: 'profile-id' }),
    getAuthToken: () => Promise.resolve({ token: 'token-for-francisco' }),
  },
  alarms: {
    onAlarm: { addListener: (listener: (alarm: { name: string }) => void) => alarmListeners.push(listener) },
    create: (name: string, info: { periodInMinutes?: number }) => {
      createdAlarms.push({ name, periodInMinutes: info.periodInMinutes });
      return Promise.resolve();
    },
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the shipped extension background', () => {
  it('starts the notes poll in the profile on a 15-minute alarm, and a notes poll that fails when the alarm fires is reported to the console', async () => {
    const notesReports: unknown[] = [];
    const createdAlarms: CreatedAlarm[] = [];
    const alarmListeners: ((alarm: { name: string }) => void)[] = [];
    const driveUnreachable = new TypeError('Drive unreachable');
    let driveReachable = true;
    const network = fakeNetwork(notesReports);
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) =>
      !driveReachable && requestUrl(input).pathname.endsWith('/drive/v3/files')
        ? Promise.reject(driveUnreachable)
        : network(input, init),
    );
    vi.stubGlobal('chrome', fakeChrome(createdAlarms, alarmListeners));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      background.main();
      const notesAlarm = await vi.waitFor(() => {
        const alarm = createdAlarms.find((created) => created.periodInMinutes === 15);
        if (alarm === undefined) throw new Error('no 15-minute alarm yet');
        return alarm;
      });
      driveReachable = false;
      for (const listener of alarmListeners) listener({ name: notesAlarm.name });

      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(expect.any(String), driveUnreachable);
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
