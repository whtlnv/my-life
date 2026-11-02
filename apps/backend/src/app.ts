import Database from 'better-sqlite3';
import { Hono } from 'hono';

import { calendarSnapshot, type HealthResponse } from '@my-life/contracts';
import { badgeCount, buildNowView, mergeCalendarSnapshots, type CalendarSnapshot, type Clock } from '@my-life/domain';

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  databasePath?: string;
}

const systemClock: Clock = { now: () => new Date() };

// Calendar is polled every 5 minutes; a source silent for twice that is stale.
const calendarStaleAfterMilliseconds = 10 * 60 * 1000;

const businessTimeZone = 'America/Mexico_City';

function describeAccountFreshness(lastReportedAtByAccount: [string, Date][], now: Date) {
  return lastReportedAtByAccount.map(([email, lastReportedAt]) => ({
    email,
    lastReportedAt: lastReportedAt.toISOString(),
    stale: now.getTime() - lastReportedAt.getTime() > calendarStaleAfterMilliseconds,
  }));
}

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const clock = options.clock ?? systemClock;
  const database = new Database(options.databasePath ?? ':memory:');
  database.exec(
    'CREATE TABLE IF NOT EXISTS calendar_snapshots (account_email TEXT PRIMARY KEY, snapshot TEXT NOT NULL, reported_at TEXT NOT NULL)',
  );
  const saveSnapshot = database.prepare(
    'INSERT INTO calendar_snapshots (account_email, snapshot, reported_at) VALUES (?, ?, ?) ON CONFLICT (account_email) DO UPDATE SET snapshot = excluded.snapshot, reported_at = excluded.reported_at',
  );
  const loadSnapshots = database.prepare<[], { account_email: string; snapshot: string; reported_at: string }>(
    'SELECT account_email, snapshot, reported_at FROM calendar_snapshots ORDER BY rowid',
  );
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
    saveSnapshot.run(snapshot.accountEmail, JSON.stringify(snapshot), clock.now().toISOString());
    return context.body(null, 200);
  });
  app.get('/now', (context) => {
    const rows = loadSnapshots.all();
    const latestSnapshots = rows.map((row) => JSON.parse(row.snapshot) as CalendarSnapshot);
    const lastReportedAtByAccount = rows.map((row): [string, Date] => [row.account_email, new Date(row.reported_at)]);
    const events = mergeCalendarSnapshots(latestSnapshots);
    return context.json({
      ...buildNowView(events, clock, businessTimeZone),
      accounts: describeAccountFreshness(lastReportedAtByAccount, clock.now()),
      badgeCount: badgeCount(events, clock),
    });
  });
  return app;
}
