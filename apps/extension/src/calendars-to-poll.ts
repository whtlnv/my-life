interface GoogleCalendarListResponse {
  items: { id: string; summary: string }[];
}

const holidayCalendarIdSuffix = '#holiday@group.v.calendar.google.com';
const birthdayCalendarId = 'addressbook#contacts@group.v.calendar.google.com';

function isIgnoredCalendar(calendarId: string): boolean {
  return calendarId.endsWith(holidayCalendarIdSuffix) || calendarId === birthdayCalendarId;
}

export function calendarIdsToPoll(calendarListResponse: GoogleCalendarListResponse): string[] {
  return calendarListResponse.items
    .filter((calendar) => !isIgnoredCalendar(calendar.id))
    .map((calendar) => calendar.id);
}
