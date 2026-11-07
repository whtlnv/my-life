import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Hono } from 'hono';

import { calendarSnapshot, type HealthResponse } from '@my-life/contracts';
import {
  badgeCount,
  buildNowView,
  isAccountFresh,
  mergeCalendarSnapshots,
  type CalendarSnapshot,
  type Clock,
} from '@my-life/domain';

import { openCalendarSnapshotStore, type StoredCalendarSnapshot } from './calendar-snapshot-store';

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  databasePath?: string;
  dashboardDirectory?: string;
}

const systemClock: Clock = { now: () => new Date() };

const calendarPollingIntervalInMilliseconds = 5 * 60 * 1000;

const businessTimeZone = 'America/Mexico_City';

function describeAccountFreshness(stored: StoredCalendarSnapshot[], clock: Clock) {
  return stored.map(({ accountEmail, reportedAt }) => {
    const report = {
      email: accountEmail,
      lastReportedAt: reportedAt.toISOString(),
      pollingIntervalInMilliseconds: calendarPollingIntervalInMilliseconds,
    };
    return { email: report.email, lastReportedAt: report.lastReportedAt, stale: !isAccountFresh(report, clock) };
  });
}

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const clock = options.clock ?? systemClock;
  const snapshotStore = openCalendarSnapshotStore(options.databasePath ?? ':memory:');
  let remainingMessages = 0;
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
  app.post('/mail-report', async (context) => {
    const report = await context.req.json<{ accountEmail: string; messages: unknown[] }>();
    if (!isAllowed(report.accountEmail)) {
      return context.body(null, 403);
    }
    remainingMessages += report.messages.length;
    return context.body(null, 200);
  });
  app.get('/triage-queue', (context) => context.json({ remaining: remainingMessages }));
  app.get('/now', (context) => {
    const stored = snapshotStore.loadAll();
    const latestSnapshots = stored.map((entry) => entry.snapshot);
    const events = mergeCalendarSnapshots(latestSnapshots);
    return context.json({
      ...buildNowView(events, clock, businessTimeZone),
      accounts: describeAccountFreshness(stored, clock),
      badgeCount: badgeCount(events, clock),
    });
  });
  const dashboardDirectory = options.dashboardDirectory;
  if (dashboardDirectory !== undefined) {
    const readDashboardFile = (...pathSegments: string[]): string =>
      readFileSync(join(dashboardDirectory, ...pathSegments), 'utf8');
    app.get('/', (context) => context.html(readDashboardFile('index.html')));
    app.get('/assets/:file', (context) => {
      const file = context.req.param('file');
      return context.body(readDashboardFile('assets', file), 200, {
        'content-type': file.endsWith('.css') ? 'text/css' : 'text/javascript',
      });
    });
  }
  return app;
}
