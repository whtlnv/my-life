import { Hono } from 'hono';

import { calendarSnapshot, type HealthResponse } from '@my-life/contracts';
import {
  buildNowView,
  mergeCalendarSnapshots,
  type CalendarSnapshot,
  type Clock,
} from '@my-life/domain';

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
}

const systemClock: Clock = { now: () => new Date() };

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const clock = options.clock ?? systemClock;
  const snapshots: CalendarSnapshot[] = [];
  const isAllowed = (email: string): boolean => options.allowedEmails.includes(email);
  const app = new Hono();
  app.get('/health', (context) => context.json({ ok: true } satisfies HealthResponse));
  app.post('/register', async (context) => {
    const { email } = await context.req.json<{ email: string }>();
    if (!isAllowed(email)) {
      return context.body(null, 403);
    }
    return context.json({ email });
  });
  app.post('/calendar-snapshot', async (context) => {
    const snapshot = await context.req.json<CalendarSnapshot>();
    if (!isAllowed(snapshot.accountEmail)) {
      return context.body(null, 403);
    }
    if (!calendarSnapshot.safeParse(snapshot).success) {
      return context.body(null, 400);
    }
    snapshots.push(snapshot);
    return context.body(null, 200);
  });
  app.get('/now', (context) =>
    context.json(buildNowView(mergeCalendarSnapshots(snapshots), clock)),
  );
  return app;
}
