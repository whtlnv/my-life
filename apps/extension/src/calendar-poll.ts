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

export async function pollCalendarOnce(options: PollCalendarOptions): Promise<void> {
  const authorization = { headers: { Authorization: `Bearer ${options.accessToken}` } };
  const calendarList = await (await options.fetch(`${calendarApi}/users/me/calendarList`, authorization)).json();
  const { timeMin, timeMax } = calendarTimeWindow(options.now, options.timeZone);
  const items = [];
  for (const calendarId of calendarIdsToPoll(calendarList)) {
    const eventsUrl = new URL(`${calendarApi}/calendars/${encodeURIComponent(calendarId)}/events`);
    eventsUrl.searchParams.set('timeMin', timeMin);
    eventsUrl.searchParams.set('timeMax', timeMax);
    const eventsResponse = await (await options.fetch(eventsUrl, authorization)).json();
    items.push(...eventsResponse.items);
  }
  await options.fetch(`${options.backendUrl}/calendar-snapshot`, {
    method: 'POST',
    body: JSON.stringify(snapshotFromCalendarEvents(options.accountEmail, { items })),
  });
}
