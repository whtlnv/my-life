import { snapshotFromCalendarEvents } from './calendar-events-snapshot';
import { calendarTimeWindow } from './calendar-time-window';
import { calendarIdsToPoll } from './calendars-to-poll';

const calendarApi = 'https://www.googleapis.com/calendar/v3';

type PollCalendarOptions = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  wait?: (milliseconds: number) => Promise<void>;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
  now: Date;
  timeZone: string;
};

function calendarEventsUrl(calendarId: string, timeMin: string, timeMax: string): URL {
  const eventsUrl = new URL(`${calendarApi}/calendars/${encodeURIComponent(calendarId)}/events`);
  eventsUrl.searchParams.set('timeMin', timeMin);
  eventsUrl.searchParams.set('timeMax', timeMax);
  eventsUrl.searchParams.set('singleEvents', 'true');
  eventsUrl.searchParams.set('orderBy', 'startTime');
  return eventsUrl;
}

export async function pollCalendarOnce(options: PollCalendarOptions): Promise<void> {
  const authorization = { headers: { Authorization: `Bearer ${options.accessToken}` } };
  const fetchJson = async (url: string | URL) => {
    let response = await options.fetch(url, authorization);
    for (let attempt = 0; response.status === 429 || response.status >= 500; attempt++) {
      await options.wait?.(1000 * 2 ** attempt);
      response = await options.fetch(url, authorization);
    }
    return response.json();
  };
  const calendarList = await fetchJson(`${calendarApi}/users/me/calendarList`);
  const { timeMin, timeMax } = calendarTimeWindow(options.now, options.timeZone);
  const items = [];
  for (const calendarId of calendarIdsToPoll(calendarList)) {
    const eventsResponse = await fetchJson(calendarEventsUrl(calendarId, timeMin, timeMax));
    items.push(...eventsResponse.items);
  }
  await options.fetch(`${options.backendUrl}/calendar-snapshot`, {
    method: 'POST',
    body: JSON.stringify(snapshotFromCalendarEvents(options.accountEmail, { items })),
  });
}
