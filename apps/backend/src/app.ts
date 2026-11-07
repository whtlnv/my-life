import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Hono } from 'hono';

import { calendarSnapshot, mailReport, type HealthResponse } from '@my-life/contracts';
import {
  badgeCount,
  buildNowView,
  describeSourceFreshness,
  isAccountFresh,
  mergeCalendarSnapshots,
  type CalendarSnapshot,
  type Clock,
  type SourceReport,
} from '@my-life/domain';

import { openCalendarSnapshotStore, type StoredCalendarSnapshot } from './calendar-snapshot-store';
import { openReportedMessageStore } from './reported-message-store';

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  databasePath?: string;
  dashboardDirectory?: string;
}

const systemClock: Clock = { now: () => new Date() };

const pollingIntervalsInMilliseconds = {
  mail: 60 * 1000,
  calendar: 5 * 60 * 1000,
};

const businessTimeZone = 'America/Mexico_City';

function describeAccountFreshness(stored: StoredCalendarSnapshot[], clock: Clock) {
  return stored.map(({ accountEmail, reportedAt }) => {
    const lastReportedAt = reportedAt.toISOString();
    const pollingIntervalInMilliseconds = pollingIntervalsInMilliseconds.calendar;
    const stale = !isAccountFresh({ email: accountEmail, lastReportedAt, pollingIntervalInMilliseconds }, clock);
    return { email: accountEmail, lastReportedAt, stale };
  });
}

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const clock = options.clock ?? systemClock;
  const databasePath = options.databasePath ?? ':memory:';
  const snapshotStore = openCalendarSnapshotStore(databasePath);
  const reportedMessageStore = openReportedMessageStore(databasePath);
  const mailSources = new Map<string, SourceReport>();
  const isAllowed = (email: string): boolean => options.allowedEmails.includes(email);
  // An account outside the allow-list is refused before its payload is checked against the contract.
  const refusalStatus = (accountEmail: string, matchesContract: () => boolean): 403 | 400 | undefined => {
    if (!isAllowed(accountEmail)) {
      return 403;
    }
    return matchesContract() ? undefined : 400;
  };
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
    const refusal = refusalStatus(snapshot.accountEmail, () => calendarSnapshot.safeParse(snapshot).success);
    if (refusal !== undefined) {
      return context.body(null, refusal);
    }
    snapshotStore.save(snapshot, clock.now());
    return context.body(null, 200);
  });
  app.post('/mail-report', async (context) => {
    const report = await context.req.json<{ accountEmail: string; messages: { id: string }[] }>();
    const refusal = refusalStatus(report.accountEmail, () => mailReport.safeParse(report).success);
    if (refusal !== undefined) {
      return context.body(null, refusal);
    }
    report.messages.forEach((message) => reportedMessageStore.save(message.id));
    mailSources.set(report.accountEmail, {
      email: report.accountEmail,
      source: 'mail',
      lastReportedAt: clock.now().toISOString(),
    });
    return context.body(null, 200);
  });
  app.get('/triage-queue', (context) => context.json({ remaining: reportedMessageStore.count() }));
  app.get('/now', (context) => {
    const stored = snapshotStore.loadAll();
    const latestSnapshots = stored.map((entry) => entry.snapshot);
    const events = mergeCalendarSnapshots(latestSnapshots);
    return context.json({
      ...buildNowView(events, clock, businessTimeZone),
      accounts: describeAccountFreshness(stored, clock),
      badgeCount: badgeCount(events, clock),
      sources: describeSourceFreshness([...mailSources.values()], pollingIntervalsInMilliseconds, clock),
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
