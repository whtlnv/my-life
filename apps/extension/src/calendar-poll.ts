import { snapshotFromCalendarEvents, type GoogleCalendarEventsResponse } from './calendar-events-snapshot';
import { calendarTimeWindow } from './calendar-time-window';
import { calendarIdsToPoll, type GoogleCalendarListResponse } from './calendars-to-poll';
import type { FetchFunction } from './fetch-function';

const calendarApi = 'https://www.googleapis.com/calendar/v3';
const maximumRetries = 4;

interface PollCalendarOptions {
  fetch: FetchFunction;
  wait?: (milliseconds: number) => Promise<void>;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
  now: Date;
  timeZone: string;
}

function calendarEventsUrl(calendarId: string, timeMin: string, timeMax: string): URL {
  const eventsUrl = new URL(`${calendarApi}/calendars/${encodeURIComponent(calendarId)}/events`);
  eventsUrl.searchParams.set('timeMin', timeMin);
  eventsUrl.searchParams.set('timeMax', timeMax);
  eventsUrl.searchParams.set('singleEvents', 'true');
  eventsUrl.searchParams.set('orderBy', 'startTime');
  return eventsUrl;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchCalendarJson<ResponseBody>(options: PollCalendarOptions, url: string | URL): Promise<ResponseBody> {
  const authorization = { headers: { Authorization: `Bearer ${options.accessToken}` } };
  let response = await options.fetch(url, authorization);
  for (let attempt = 0; attempt < maximumRetries && isRetryable(response.status); attempt++) {
    await options.wait?.(1000 * 2 ** attempt);
    response = await options.fetch(url, authorization);
  }
  if (!response.ok) {
    throw new Error(`Calendar answered ${String(response.status)}`);
  }
  return (await response.json()) as ResponseBody;
}

export async function pollCalendarOnce(options: PollCalendarOptions): Promise<void> {
  const calendarList = await fetchCalendarJson<GoogleCalendarListResponse>(
    options,
    `${calendarApi}/users/me/calendarList`,
  );
  const { timeMin, timeMax } = calendarTimeWindow(options.now, options.timeZone);
  const items: GoogleCalendarEventsResponse['items'] = [];
  for (const calendarId of calendarIdsToPoll(calendarList)) {
    const eventsResponse = await fetchCalendarJson<GoogleCalendarEventsResponse>(
      options,
      calendarEventsUrl(calendarId, timeMin, timeMax),
    );
    items.push(...eventsResponse.items);
  }
  await options.fetch(`${options.backendUrl}/calendar-snapshot`, {
    method: 'POST',
    body: JSON.stringify(snapshotFromCalendarEvents(options.accountEmail, { items })),
  });
}
