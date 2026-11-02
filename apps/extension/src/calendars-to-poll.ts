type GoogleCalendarListResponse = {
  items: { id: string }[];
};

export function calendarIdsToPoll(calendarListResponse: GoogleCalendarListResponse): string[] {
  return calendarListResponse.items.map((calendar) => calendar.id);
}
