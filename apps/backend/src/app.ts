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

// Calendar is polled every 5 minutes; a source silent for twice that is stale.
const calendarStaleAfterMilliseconds = 10 * 60 * 1000;

function describeAccountFreshness(lastReportedAtByAccount: Map<string, Date>, now: Date) {
  return [...lastReportedAtByAccount].map(([email, lastReportedAt]) => ({
    email,
    lastReportedAt: lastReportedAt.toISOString(),
    stale: now.getTime() - lastReportedAt.getTime() > calendarStaleAfterMilliseconds,
  }));
}

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const clock = options.clock ?? systemClock;
  const snapshotsByAccount = new Map<string, CalendarSnapshot>();
  const lastReportedAtByAccount = new Map<string, Date>();
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
    snapshotsByAccount.set(snapshot.accountEmail, snapshot);
    lastReportedAtByAccount.set(snapshot.accountEmail, clock.now());
    return context.body(null, 200);
  });
  app.get('/now', (context) => {
    const latestSnapshots = [...snapshotsByAccount.values()];
    return context.json({
      ...buildNowView(mergeCalendarSnapshots(latestSnapshots), clock),
      accounts: describeAccountFreshness(lastReportedAtByAccount, clock.now()),
      badgeCount: 1,
    });
  });
  return app;
}
