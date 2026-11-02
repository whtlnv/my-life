import { snapshotFromCalendarEvents } from './calendar-events-snapshot';
import { calendarTimeWindow } from './calendar-time-window';
import { calendarIdsToPoll } from './calendars-to-poll';

const calendarApi = 'https://www.googleapis.com/calendar/v3';

type PollCalendarOptions = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
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
  return eventsUrl;
}

export async function pollCalendarOnce(options: PollCalendarOptions): Promise<void> {
  const authorization = { headers: { Authorization: `Bearer ${options.accessToken}` } };
  const fetchJson = async (url: string | URL) => (await options.fetch(url, authorization)).json();
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
