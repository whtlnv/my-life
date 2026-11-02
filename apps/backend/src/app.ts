import { Hono } from 'hono';

import { calendarSnapshot, type HealthResponse } from '@my-life/contracts';
import { badgeCount, buildNowView, mergeCalendarSnapshots, type CalendarSnapshot, type Clock } from '@my-life/domain';

import { openCalendarSnapshotStore, type StoredCalendarSnapshot } from './calendar-snapshot-store';

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  databasePath?: string;
}

const systemClock: Clock = { now: () => new Date() };

// Calendar is polled every 5 minutes; a source silent for twice that is stale.
const calendarStaleAfterMilliseconds = 10 * 60 * 1000;

const businessTimeZone = 'America/Mexico_City';

function describeAccountFreshness(stored: StoredCalendarSnapshot[], now: Date) {
  return stored.map(({ accountEmail, reportedAt }) => ({
    email: accountEmail,
    lastReportedAt: reportedAt.toISOString(),
    stale: now.getTime() - reportedAt.getTime() > calendarStaleAfterMilliseconds,
  }));
}

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const clock = options.clock ?? systemClock;
  const snapshotStore = openCalendarSnapshotStore(options.databasePath ?? ':memory:');
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
    snapshotStore.save(snapshot, clock.now());
    return context.body(null, 200);
  });
  app.get('/now', (context) => {
    const stored = snapshotStore.loadAll();
    const latestSnapshots = stored.map((entry) => entry.snapshot);
    const events = mergeCalendarSnapshots(latestSnapshots);
    return context.json({
      ...buildNowView(events, clock, businessTimeZone),
      accounts: describeAccountFreshness(stored, clock.now()),
      badgeCount: badgeCount(events, clock),
    });
  });
  return app;
}
