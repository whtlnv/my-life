type GoogleCalendarListResponse = {
  items: { id: string; summary: string }[];
};

const ignoredCalendarSummaries = ['Holidays', 'Birthdays'];

export function calendarIdsToPoll(calendarListResponse: GoogleCalendarListResponse): string[] {
  return calendarListResponse.items
    .filter((calendar) => !ignoredCalendarSummaries.includes(calendar.summary))
    .map((calendar) => calendar.id);
}
