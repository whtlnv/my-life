import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

type CalendarScenario = 'empty' | 'overlapping';

const scenarios: Record<CalendarScenario, { calendarList: unknown; events: unknown }> = {
  empty: { calendarList: { items: [] }, events: { items: [] } },
  overlapping: {
    calendarList: { items: [{ id: 'primary', summary: 'Primary' }] },
    events: {
      items: [
        {
          id: 'standup',
          iCalUID: 'standup@example.com',
          summary: 'Standup',
          start: { dateTime: '2026-11-02T15:00:00.000Z' },
          end: { dateTime: '2026-11-02T15:30:00.000Z' },
        },
        {
          id: 'client-call',
          iCalUID: 'client-call@example.com',
          summary: 'Client call',
          start: { dateTime: '2026-11-02T15:05:00.000Z' },
          end: { dateTime: '2026-11-02T16:00:00.000Z' },
        },
      ],
    },
  },
};

export async function startCalendarFakeServer(scenario: CalendarScenario) {
  const { calendarList, events } = scenarios[scenario];
  const server = createServer((request, response) => {
    const body = request.url?.startsWith('/calendar/v3/users/me/calendarList') ? calendarList : events;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
