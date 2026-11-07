import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { healthResponse } from '@my-life/contracts';

import { createApp } from './app';
import { createClaudeTriage } from './claude-triage';
import { openProposalStore } from './proposal-store';
import { openSpendStore } from './spend-store';
import { openVerdictStore } from './verdict-store';

type App = ReturnType<typeof createApp>;

const postJson = (app: App, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const postCalendarSnapshot = (app: App, accountEmail: string, events: unknown[]) =>
  postJson(app, '/calendar-snapshot', { accountEmail, events });

const postRegistration = (app: App, email: string) => postJson(app, '/register', { email });

const postTriageRun = (app: App) => app.request('/triage-run', { method: 'POST' });

const getCommands = (app: App, accountEmail: string) =>
  app.request(`/commands?accountEmail=${encodeURIComponent(accountEmail)}`);

const temporaryDatabasePath = () => join(mkdtempSync(join(tmpdir(), 'my-life-')), 'my-life.sqlite');

const clockAtTenPastThree = { now: () => new Date('2026-11-02T15:10:00.000Z') };

const budgetReviewReport = {
  accountEmail: 'ana@example.com',
  historyId: '1001',
  messages: [
    {
      id: 'message-1',
      threadId: 'thread-1',
      from: 'Luis <luis@example.com>',
      to: 'ana@example.com',
      subject: 'Budget review',
      date: 'Mon, 2 Nov 2026 09:00:00 -0600',
      snippet: 'Can you review the budget by Friday?',
    },
  ],
};

const weeklySync = {
  id: 'event-1',
  iCalUID: 'event-1@google.com',
  title: 'Weekly sync',
  start: '2026-11-02T15:00:00.000Z',
  end: '2026-11-02T15:30:00.000Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'luis@example.com', displayName: 'Luis' }],
};

const ccThreadTriage = (action: 'archive' | 'keep') => {
  const proposal = {
    action,
    category: 'cc-thread',
    summary: 'Luis shared the budget with the team',
    extract: { sinceLastMessage: 'Luis shared the budget' },
    reason: 'The user is only copied',
  };
  return { propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }) };
};

const confirmBudgetReviewProposal = async (app: App) => {
  await postJson(app, '/mail-report', budgetReviewReport);
  await postTriageRun(app);
  await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
};

const appServingDashboardAsset = (fileName: string, content: string) => {
  const dashboardDirectory = mkdtempSync(join(tmpdir(), 'my-life-dashboard-'));
  mkdirSync(join(dashboardDirectory, 'assets'));
  writeFileSync(join(dashboardDirectory, 'assets', fileName), content);
  return createApp({ allowedEmails: [], dashboardDirectory });
};

describe('backend app', () => {
  it('answers GET /health with the healthy answer', async () => {
    const response = await createApp().request('/health');

    expect(response.status).toBe(200);
    expect(healthResponse.parse(await response.json())).toEqual({ ok: true });
  });

  it('accepts a registration from an email in the allow-list', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const response = await postRegistration(app, 'ana@example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'ana@example.com' });
  });

  it('refuses a registration from an email not in the allow-list', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const response = await postRegistration(app, 'stranger@example.com');

    expect(response.status).toBe(403);
  });

  it('answers success to a calendar snapshot from an allow-listed account and shows its events in GET /now', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });

    const posted = await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    const now = await app.request('/now');

    expect(posted.status).toBe(200);
    expect(now.status).toBe(200);
    expect(await now.json()).toMatchObject({
      current: [{ ...weeklySync, accounts: ['ana@example.com'] }],
    });
  });

  it('refuses a calendar snapshot from an account outside the allow-list and shows none of its events in GET /now', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const intruderMeeting = {
      id: 'event-9',
      iCalUID: 'event-9@google.com',
      title: 'Intruder meeting',
      start: '2026-11-02T15:00:00.000Z',
      end: '2026-11-02T15:30:00.000Z',
      meetLink: null,
      attendees: [],
    };

    const posted = await postCalendarSnapshot(app, 'stranger@example.com', [intruderMeeting]);
    const now = await app.request('/now');

    expect(posted.status).toBe(403);
    expect(await now.json()).toMatchObject({ current: [] });
  });

  it('refuses a calendar snapshot that fails the shared contract with a client error', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const meetingWithoutStart = {
      id: 'event-3',
      iCalUID: 'event-3@google.com',
      title: 'Meeting without start',
      end: '2026-11-02T15:30:00.000Z',
      attendees: [],
    };

    const posted = await postCalendarSnapshot(app, 'ana@example.com', [meetingWithoutStart]);
    const now = await app.request('/now');

    expect(posted.status).toBe(400);
    expect(await now.json()).toMatchObject({ current: [] });
  });

  it('merges the snapshots of two accounts in GET /now, showing a cross-account duplicate once', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bob@example.com'],
      clock: clockAtTenPastThree,
    });
    const dentist = {
      id: 'event-2',
      iCalUID: 'event-2@google.com',
      title: 'Dentist',
      start: '2026-11-02T15:05:00.000Z',
      end: '2026-11-02T16:00:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    await postCalendarSnapshot(app, 'bob@example.com', [{ ...weeklySync, id: 'event-1-as-seen-by-bob' }, dentist]);
    const now = await app.request('/now');

    const { current } = (await now.json()) as { current: { iCalUID: string; accounts: string[] }[] };
    expect(current).toHaveLength(2);
    expect(current.map(({ iCalUID, accounts }) => ({ iCalUID, accounts }))).toEqual([
      { iCalUID: weeklySync.iCalUID, accounts: ['ana@example.com', 'bob@example.com'] },
      { iCalUID: dentist.iCalUID, accounts: ['bob@example.com'] },
    ]);
  });

  it("replaces an account's events with its newer snapshot in GET /now, dropping an event missing from it", async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const standUp = {
      id: 'event-4',
      iCalUID: 'event-4@google.com',
      title: 'Stand-up',
      start: '2026-11-02T15:05:00.000Z',
      end: '2026-11-02T15:45:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    await postCalendarSnapshot(app, 'ana@example.com', [standUp]);
    const now = await app.request('/now');

    const { current } = (await now.json()) as { current: { iCalUID: string }[] };
    expect(current.map(({ iCalUID }) => iCalUID)).toEqual([standUp.iCalUID]);
  });

  it('reports in GET /now when each account last reported and whether it is stale', async () => {
    let currentTime = new Date('2026-11-02T15:00:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bob@example.com'],
      clock: { now: () => currentTime },
    });

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    currentTime = new Date('2026-11-02T15:10:00.000Z');
    await postCalendarSnapshot(app, 'bob@example.com', [weeklySync]);
    currentTime = new Date('2026-11-02T15:12:00.000Z');
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({
      accounts: [
        { email: 'ana@example.com', lastReportedAt: '2026-11-02T15:00:00.000Z', stale: true },
        { email: 'bob@example.com', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: false },
      ],
    });
  });

  it('includes in GET /now the badge count of events starting within 15 minutes', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const startingSoon = {
      id: 'event-5',
      iCalUID: 'event-5@google.com',
      title: 'Starting soon',
      start: '2026-11-02T15:20:00.000Z',
      end: '2026-11-02T15:50:00.000Z',
      attendees: [],
    };
    const startingLater = {
      id: 'event-6',
      iCalUID: 'event-6@google.com',
      title: 'Starting later',
      start: '2026-11-02T15:40:00.000Z',
      end: '2026-11-02T16:00:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync, startingSoon, startingLater]);
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({ badgeCount: 1 });
  });

  it('makes the GET /now badge count zero when no event starts within 15 minutes and two when two do', async () => {
    const quietApp = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const busyApp = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const startingAtQuarterPast = {
      id: 'event-7',
      iCalUID: 'event-7@google.com',
      title: 'Starting at quarter past',
      start: '2026-11-02T15:15:00.000Z',
      end: '2026-11-02T15:45:00.000Z',
      attendees: [],
    };
    const startingAtTwentyPast = {
      id: 'event-8',
      iCalUID: 'event-8@google.com',
      title: 'Starting at twenty past',
      start: '2026-11-02T15:20:00.000Z',
      end: '2026-11-02T15:50:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(quietApp, 'ana@example.com', [weeklySync]);
    await postCalendarSnapshot(busyApp, 'ana@example.com', [weeklySync, startingAtQuarterPast, startingAtTwentyPast]);

    expect(await (await quietApp.request('/now')).json()).toMatchObject({ badgeCount: 0 });
    expect(await (await busyApp.request('/now')).json()).toMatchObject({ badgeCount: 2 });
  });

  it("bounds later today in GET /now by midnight in America/Mexico_City, not the machine's time zone", async () => {
    const machineTimeZone = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      // 04:00Z on Nov 3 is 22:00 on Nov 2 in Mexico City, but already Nov 3 on a UTC machine.
      const app = createApp({
        allowedEmails: ['ana@example.com'],
        clock: { now: () => new Date('2026-11-03T04:00:00.000Z') },
      });
      const lateCall = {
        id: 'event-10',
        iCalUID: 'event-10@google.com',
        title: 'Late call',
        start: '2026-11-03T05:00:00.000Z',
        end: '2026-11-03T05:30:00.000Z',
        attendees: [],
      };
      const afterMidnightStandup = {
        id: 'event-11',
        iCalUID: 'event-11@google.com',
        title: 'After-midnight standup',
        start: '2026-11-03T06:30:00.000Z',
        end: '2026-11-03T07:00:00.000Z',
        attendees: [],
      };

      await postCalendarSnapshot(app, 'ana@example.com', [lateCall, afterMidnightStandup]);
      const now = await app.request('/now');

      const { laterToday } = (await now.json()) as { laterToday: { iCalUID: string }[] };
      expect(laterToday.map(({ iCalUID }) => iCalUID)).toEqual([lateCall.iCalUID]);
    } finally {
      if (machineTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = machineTimeZone;
      }
    }
  });

  it('still serves in GET /now a snapshot reported before a backend restart', async () => {
    const databasePath = temporaryDatabasePath();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
    };
    const beforeRestart = createApp(options);
    await postCalendarSnapshot(beforeRestart, 'ana@example.com', [weeklySync]);

    const afterRestart = createApp(options);
    const now = await afterRestart.request('/now');

    expect(await now.json()).toMatchObject({
      current: [{ ...weeklySync, accounts: ['ana@example.com'] }],
    });
  });

  it('creates the database folder when it is missing on start', () => {
    const missingFolder = join(mkdtempSync(join(tmpdir(), 'my-life-')), 'Application Support', 'my-life');
    const databasePath = join(missingFolder, 'my-life.sqlite');

    createApp({ allowedEmails: [], databasePath });

    expect(existsSync(databasePath)).toBe(true);
  });

  it("serves the dashboard build's index page at GET /", async () => {
    const dashboardDirectory = mkdtempSync(join(tmpdir(), 'my-life-dashboard-'));
    const indexPage = '<!doctype html><html><body><div id="root"></div></body></html>';
    writeFileSync(join(dashboardDirectory, 'index.html'), indexPage);
    const app = createApp({ allowedEmails: [], dashboardDirectory });

    const response = await app.request('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe(indexPage);
  });

  it("serves the dashboard build's bundled script at GET /assets/<file>", async () => {
    const bundledScript = 'document.getElementById("root").textContent = "Now";';
    const app = appServingDashboardAsset('index-abc123.js', bundledScript);

    const response = await app.request('/assets/index-abc123.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toBe(bundledScript);
  });

  it('serves a dashboard stylesheet at GET /assets/<file>.css as a stylesheet, not as a script', async () => {
    const stylesheet = '#root { font-family: sans-serif; }';
    const app = appServingDashboardAsset('index-def456.css', stylesheet);

    const response = await app.request('/assets/index-def456.css');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    expect(await response.text()).toBe(stylesheet);
  });

  it('accepts a mail report from an allow-listed account at POST /mail-report and counts its message as remaining in GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const posted = await postJson(app, '/mail-report', budgetReviewReport);
    const queue = await app.request('/triage-queue');

    expect(posted.status).toBe(200);
    expect(queue.status).toBe(200);
    expect(await queue.json()).toMatchObject({ remaining: 1 });
  });

  it('refuses a mail report from an account outside the allow-list and counts none of its messages as remaining in GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const posted = await postJson(app, '/mail-report', {
      accountEmail: 'stranger@example.com',
      historyId: '1001',
      messages: [
        {
          id: 'message-9',
          threadId: 'thread-9',
          from: 'Luis <luis@example.com>',
          to: 'stranger@example.com',
          subject: 'Intruder mail',
          date: 'Mon, 2 Nov 2026 09:00:00 -0600',
          snippet: 'This should never reach the queue.',
        },
      ],
    });
    const queue = await app.request('/triage-queue');

    expect(posted.status).toBe(403);
    expect(await queue.json()).toMatchObject({ remaining: 0 });
  });

  it('refuses a mail report that fails the shared contract with a client error and counts none of its messages as remaining in GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });
    const messageWithoutSubject = {
      id: 'message-3',
      threadId: 'thread-3',
      from: 'Luis <luis@example.com>',
      to: 'ana@example.com',
      date: 'Mon, 2 Nov 2026 09:00:00 -0600',
      snippet: 'This message has no subject.',
    };

    const posted = await postJson(app, '/mail-report', {
      accountEmail: 'ana@example.com',
      historyId: '1001',
      messages: [messageWithoutSubject],
    });
    const queue = await app.request('/triage-queue');

    expect(posted.status).toBe(400);
    expect(await queue.json()).toMatchObject({ remaining: 0 });
  });

  it('counts a message reported twice at POST /mail-report once in GET /triage-queue', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    await postJson(app, '/mail-report', budgetReviewReport);
    const second = await postJson(app, '/mail-report', budgetReviewReport);
    const queue = await app.request('/triage-queue');

    expect(second.status).toBe(200);
    expect(await queue.json()).toMatchObject({ remaining: 1 });
  });

  it('still counts in GET /triage-queue a message reported before a backend restart, and once when it is reported again after it', async () => {
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], databasePath };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);

    const afterRestart = createApp(options);
    const queueAfterRestart = await afterRestart.request('/triage-queue');
    await postJson(afterRestart, '/mail-report', budgetReviewReport);
    const queueAfterReportedAgain = await afterRestart.request('/triage-queue');

    expect(await queueAfterRestart.json()).toMatchObject({ remaining: 1 });
    expect(await queueAfterReportedAgain.json()).toMatchObject({ remaining: 1 });
  });

  it("shows in GET /now when an account's mail source last reported, at the time its mail report was received", async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => currentTime } });

    await postJson(app, '/mail-report', budgetReviewReport);
    currentTime = new Date('2026-11-02T15:10:30.000Z');
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({
      sources: [{ email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: false }],
    });
  });

  it('marks the mail source stale in GET /now by the Gmail polling interval the app was created with: with 30 seconds, a report received 70 seconds ago is stale', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      gmailPollingIntervalInMilliseconds: 30 * 1000,
    });

    await postJson(app, '/mail-report', budgetReviewReport);
    currentTime = new Date('2026-11-02T15:11:10.000Z');
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({
      sources: [{ email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: true }],
    });
  });

  it("still shows in GET /now when an account's mail source last reported, after a backend restart on the same database file", async () => {
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);

    const afterRestart = createApp(options);
    const now = await afterRestart.request('/now');

    expect(await now.json()).toMatchObject({
      sources: [{ email: 'ana@example.com', source: 'mail', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: false }],
    });
  });

  it('asks triage at POST /triage-run for a proposal on each reported message that has none, newest first', async () => {
    const askedMessageIds: string[] = [];
    const triage = {
      propose: (message: { id: string }) => {
        askedMessageIds.push(message.id);
        return Promise.resolve({
          proposal: {
            action: 'keep',
            category: 'unknown',
            summary: 'A message',
            extract: {},
            reason: 'Not sure what it is',
          },
        });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });

    const run = await postTriageRun(app);

    expect(run.status).toBe(200);
    expect(askedMessageIds).toEqual(['message-newest', 'message-middle', 'message-older']);
  });

  it('hands triage at POST /triage-run each message with the email of the account that reported it', async () => {
    const askedMessages: unknown[] = [];
    const triage = {
      propose: (message: unknown) => {
        askedMessages.push(message);
        return Promise.resolve({ proposal: undefined, costInUsd: 0, promptVersion: 'triage-v1' });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, to: 'team@example.com', cc: 'ana@example.com' }],
    });

    await postTriageRun(app);

    expect(askedMessages).toEqual([
      expect.objectContaining({ id: 'message-1', cc: 'ana@example.com', accountEmail: 'ana@example.com' }),
    ]);
  });

  it('hands triage at POST /triage-run the verdict on an earlier message from the same sender as an example', async () => {
    const examplesAskedWith: unknown[] = [];
    const proposal = {
      action: 'archive',
      category: 'cc-thread',
      summary: 'Luis shared the budget with the team',
      extract: { sinceLastMessage: 'Luis shared the budget' },
      reason: 'The user is only copied',
    };
    const triage = {
      propose: (_message: unknown, examples?: unknown[]) => {
        examplesAskedWith.push(examples);
        return Promise.resolve({ proposal, costInUsd: 0, promptVersion: 'triage-v1' });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await confirmBudgetReviewProposal(app);
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, id: 'message-2', threadId: 'thread-2', subject: 'Budget follow-up' }],
    });

    await postTriageRun(app);

    expect(examplesAskedWith[1]).toEqual([
      expect.objectContaining({ messageId: 'message-1', decision: 'confirmed', category: 'cc-thread' }),
    ]);
  });

  it('hands triage at POST /triage-run the same-sender verdicts as examples newest first, as the domain chooses them', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const proposal = {
      action: 'archive',
      category: 'cc-thread',
      summary: 'Luis shared the budget with the team',
      extract: { sinceLastMessage: 'Luis shared the budget' },
      reason: 'The user is only copied',
    };
    const triage = {
      propose: (message: { id: string }, examples?: unknown[]) => {
        examplesByMessageId.set(message.id, examples);
        return Promise.resolve({ proposal, costInUsd: 0, promptVersion: 'triage-v1' });
      },
    };
    let now = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => now }, triage });
    const [budgetReview] = budgetReviewReport.messages;
    const fromLuis = (id: string, subject: string) => ({ ...budgetReview, id, threadId: `thread-${id}`, subject });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [fromLuis('message-1', 'Budget review'), fromLuis('message-2', 'Budget draft')],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    now = new Date('2026-11-02T15:20:00.000Z');
    await postJson(app, '/verdicts', { messageId: 'message-2', decision: 'confirmed' });
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [fromLuis('message-3', 'Budget final')] });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-3')).toEqual([
      expect.objectContaining({ messageId: 'message-2' }),
      expect.objectContaining({ messageId: 'message-1' }),
    ]);
  });

  it('hands triage at POST /triage-run only the newest eight of ten same-sender verdicts as examples', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const proposal = {
      action: 'archive',
      category: 'cc-thread',
      summary: 'Luis shared the budget with the team',
      extract: { sinceLastMessage: 'Luis shared the budget' },
      reason: 'The user is only copied',
    };
    const triage = {
      propose: (message: { id: string }, examples?: unknown[]) => {
        examplesByMessageId.set(message.id, examples);
        return Promise.resolve({ proposal, costInUsd: 0, promptVersion: 'triage-v1' });
      },
    };
    let now = new Date('2026-11-02T15:00:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => now }, triage });
    const [budgetReview] = budgetReviewReport.messages;
    const fromLuis = (id: string) => ({ ...budgetReview, id, threadId: `thread-${id}`, subject: `Budget ${id}` });
    const earlierIds = Array.from({ length: 10 }, (_, index) => `message-${String(index + 1)}`);
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: earlierIds.map(fromLuis) });
    await postTriageRun(app);
    for (const [index, messageId] of earlierIds.entries()) {
      now = new Date(Date.parse('2026-11-02T15:00:00.000Z') + (index + 1) * 60_000);
      await postJson(app, '/verdicts', { messageId, decision: 'confirmed' });
    }
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [fromLuis('message-11')] });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-11')).toEqual(
      earlierIds
        .slice(2)
        .reverse()
        .map((messageId) => expect.objectContaining({ messageId }) as unknown),
    );
  });

  it('does not ask triage again at POST /triage-run for a message that already has a proposal', async () => {
    const askedMessageIds: string[] = [];
    const triage = {
      propose: (message: { id: string }) => {
        askedMessageIds.push(message.id);
        return Promise.resolve({
          proposal: {
            action: 'keep',
            category: 'unknown',
            summary: 'A message',
            extract: {},
            reason: 'Not sure what it is',
          },
        });
      },
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [{ ...budgetReview, id: 'message-once' }] });
    await postTriageRun(app);

    const secondRun = await postTriageRun(app);

    expect(secondRun.status).toBe(200);
    expect(askedMessageIds).toEqual(['message-once']);
  });

  it("stops asking triage at POST /triage-run once today's spend reaches the daily ceiling", async () => {
    const askedMessageIds: string[] = [];
    const triage = {
      propose: (message: { id: string }) => {
        askedMessageIds.push(message.id);
        return Promise.resolve({
          proposal: {
            action: 'keep',
            category: 'unknown',
            summary: 'A message',
            extract: {},
            reason: 'Not sure what it is',
          },
          costInUsd: 12,
        });
      },
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });

    const run = await postTriageRun(app);

    expect(run.status).toBe(200);
    expect(askedMessageIds).toEqual(['message-newest', 'message-middle']);
  });

  it('stores each proposal made at POST /triage-run with the time it was made and the prompt version that made it', async () => {
    const proposal = {
      action: 'keep',
      category: 'unknown',
      summary: 'A message',
      extract: {},
      reason: 'Not sure what it is',
    };
    const triage = {
      propose: () => Promise.resolve({ proposal, costInUsd: 0.05, promptVersion: 'triage-v1' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(openProposalStore(databasePath).loadAll()).toEqual([
      { messageId: 'message-1', madeAt: '2026-11-02T15:10:00.000Z', promptVersion: 'triage-v1', proposal },
    ]);
  });

  it('logs the spend of each triage call made at POST /triage-run with its time, model and cost', async () => {
    const triage = {
      propose: () =>
        Promise.resolve({ proposal: {}, costInUsd: 0.05, model: 'claude-opus-5-5', promptVersion: 'triage-v1' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(openSpendStore(databasePath).loadAll()).toEqual([
      { spentAt: '2026-11-02T15:10:00.000Z', model: 'claude-opus-5-5', costInUsd: 0.05 },
    ]);
  });

  it('logs each triage spend at POST /triage-run with the triage model configured for the Claude adapter, not an empty string', async () => {
    const promptPath = join(mkdtempSync(join(tmpdir(), 'my-life-prompts-')), 'triage-v1.md');
    writeFileSync(promptPath, 'Classify this email and answer by calling propose_triage.');
    const triage = createClaudeTriage({
      model: 'claude-model-from-settings',
      promptPath,
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () => Promise.resolve({ content: [], usage: { input_tokens: 0, output_tokens: 0 } }),
    });
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);

    await postTriageRun(app);

    expect(
      openSpendStore(databasePath)
        .loadAll()
        .map((spend) => spend.model),
    ).toEqual(['claude-model-from-settings']);
  });
  it("neither triages again after a backend restart a message proposed before it, nor forgets the spend logged before it toward today's ceiling", async () => {
    const askedMessageIds: string[] = [];
    const triage = {
      propose: (message: { id: string }) => {
        askedMessageIds.push(message.id);
        return Promise.resolve({ proposal: {}, costInUsd: 12, model: 'claude-opus-5-5', promptVersion: 'triage-v1' });
      },
    };
    const databasePath = temporaryDatabasePath();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      databasePath,
      triage,
    };
    const [budgetReview] = budgetReviewReport.messages;
    const newest = { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', { ...budgetReviewReport, messages: [newest] });
    await postTriageRun(beforeRestart);
    askedMessageIds.length = 0;
    const afterRestart = createApp(options);
    await postJson(afterRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        newest,
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });

    await postTriageRun(afterRestart);

    expect(askedMessageIds).toEqual(['message-middle']);
  });
  it("counts toward today's ceiling after a backend restart only the spend logged today in America/Mexico_City, not yesterday's", async () => {
    const askedMessageIds: string[] = [];
    const triage = {
      propose: (message: { id: string }) => {
        askedMessageIds.push(message.id);
        return Promise.resolve({ proposal: {}, costInUsd: 10, model: 'claude-opus-5-5', promptVersion: 'triage-v1' });
      },
    };
    const databasePath = temporaryDatabasePath();
    const spendBeforeRestart = openSpendStore(databasePath);
    // 05:00Z on Nov 2 is still 23:00 on Nov 1 in Mexico City: yesterday for a clock at 15:10Z on Nov 2.
    spendBeforeRestart.save({ spentAt: '2026-11-02T05:00:00.000Z', model: 'claude-opus-5-5', costInUsd: 15 });
    spendBeforeRestart.save({ spentAt: '2026-11-02T14:00:00.000Z', model: 'claude-opus-5-5', costInUsd: 10 });
    const afterRestart = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      databasePath,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(afterRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
      ],
    });

    await postTriageRun(afterRestart);

    expect(askedMessageIds).toEqual(['message-newest']);
  });

  it('answers GET /triage-queue with the action block, the groups with their counts, the number of messages remaining and whether the ceiling paused triage', async () => {
    const proposalsInOrder = [
      {
        action: 'act',
        category: 'action',
        summary: 'Luis asks for a budget review',
        extract: { asker: 'Luis', ask: 'Review the budget' },
        reason: 'Luis asks the user directly',
      },
      {
        action: 'archive',
        category: 'expense',
        summary: 'Receipt from Acme',
        extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
        reason: 'A receipt to file',
      },
    ];
    const triage = {
      propose: () => Promise.resolve({ proposal: proposalsInOrder.shift(), costInUsd: 12, promptVersion: 'triage-v1' }),
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      triage,
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-older', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
        { ...budgetReview, id: 'message-newest', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-middle', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    expect(queue.status).toBe(200);
    expect(await queue.json()).toMatchObject({
      action: [{ messageId: 'message-newest' }],
      groups: [{ category: 'expense', count: 1 }],
      remaining: 1,
      paused: true,
    });
  });

  it('puts in the action block of GET /triage-queue the unknown proposals next to the action ones, with no unknown group', async () => {
    const proposalsInOrder = [
      {
        action: 'act',
        category: 'action',
        summary: 'Luis asks for a budget review',
        extract: { asker: 'Luis', ask: 'Review the budget' },
        reason: 'Luis asks the user directly',
      },
      {
        action: 'keep',
        category: 'unknown',
        summary: 'A message that fits no category',
        extract: {},
        reason: 'Nothing in it matches a known category',
      },
    ];
    const triage = {
      propose: () => Promise.resolve({ proposal: proposalsInOrder.shift(), costInUsd: 1, promptVersion: 'triage-v1' }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-action', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-unknown', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { action, groups } = (await queue.json()) as {
      action: { messageId: string }[];
      groups: { category: string }[];
    };
    expect(action.map(({ messageId }) => messageId).sort()).toEqual(['message-action', 'message-unknown']);
    expect(groups.map(({ category }) => category)).not.toContain('unknown');
  });

  it('carries in each GET /triage-queue group its items, and in a system-update group its sending-system sub-groups with their items', async () => {
    const expenseProposal = {
      action: 'archive',
      category: 'expense',
      summary: 'Receipt from Acme',
      extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
      reason: 'A receipt to file',
    };
    const systemUpdateProposal = {
      action: 'archive',
      category: 'system-update',
      summary: 'GitHub build passed',
      extract: { system: 'GitHub', severity: 'info', significant: false },
      reason: 'A routine notification',
    };
    const proposalsInOrder = [expenseProposal, systemUpdateProposal];
    const triage = {
      propose: () => Promise.resolve({ proposal: proposalsInOrder.shift(), costInUsd: 1, promptVersion: 'triage-v1' }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-expense', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-system', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { groups } = (await queue.json()) as { groups: { category: string }[] };
    const expenseItem = {
      messageId: 'message-expense',
      category: 'expense',
      summary: expenseProposal.summary,
      extract: expenseProposal.extract,
      reason: expenseProposal.reason,
      accountEmail: 'ana@example.com',
      link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-expense',
    };
    const systemItem = {
      messageId: 'message-system',
      category: 'system-update',
      summary: systemUpdateProposal.summary,
      extract: systemUpdateProposal.extract,
      reason: systemUpdateProposal.reason,
      accountEmail: 'ana@example.com',
      link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-system',
    };
    expect(groups.find(({ category }) => category === 'expense')).toMatchObject({ items: [expenseItem] });
    expect(groups.find(({ category }) => category === 'system-update')).toMatchObject({
      items: [systemItem],
      systems: [{ system: 'GitHub', items: [systemItem] }],
    });
  });

  it('says in GET /triage-queue which account each item came from and links to the message in Gmail for that account', async () => {
    const triage = {
      propose: () =>
        Promise.resolve({
          proposal: {
            action: 'act',
            category: 'action',
            summary: 'Luis asks for a budget review',
            extract: { asker: 'Luis', ask: 'Review the budget' },
            reason: 'Luis asks the user directly',
          },
          costInUsd: 1,
          promptVersion: 'triage-v1',
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({
      action: [
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        },
      ],
    });
  });

  it('keeps in GET /triage-queue the account email, action, category, summary and extract of a proposal made before a backend restart on the same database file', async () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = { propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }) };
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);
    await postTriageRun(beforeRestart);

    const afterRestart = createApp(options);
    const queue = await afterRestart.request('/triage-queue');

    expect(await queue.json()).toMatchObject({
      action: [
        {
          messageId: 'message-1',
          accountEmail: 'ana@example.com',
          action: 'act',
          category: 'action',
          summary: 'Luis asks for a budget review',
          extract: { asker: 'Luis', ask: 'Review the budget' },
        },
      ],
    });
  });

  it('shows in GET /triage-queue the action, summary and extract of a proposal made in the current run, without a restart', async () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = { propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }) };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({
      action: [
        {
          messageId: 'message-1',
          action: 'act',
          summary: 'Luis asks for a budget review',
          extract: { asker: 'Luis', ask: 'Review the budget' },
        },
      ],
    });
  });

  it('stores a verdict posted at POST /verdicts for a waiting proposal with the time it was decided, and the item leaves GET /triage-queue', async () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = { propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }) };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });

    expect(response.status).toBe(200);
    expect(openVerdictStore(databasePath).loadAll()).toEqual([
      { messageId: 'message-1', decision: 'confirmed', decidedAt: '2026-11-02T15:10:00.000Z' },
    ]);
    const queue = await app.request('/triage-queue');
    expect(await queue.json()).toMatchObject({ action: [] });
  });

  it('refuses a verdict posted at POST /verdicts for a message that has no proposal as not found, and stores nothing', async () => {
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });

    const response = await postJson(app, '/verdicts', { messageId: 'unknown-message', decision: 'confirmed' });

    expect(response.status).toBe(404);
    expect(openVerdictStore(databasePath).loadAll()).toEqual([]);
  });

  it('stores the correction of a rejection posted at POST /verdicts together with the verdict', async () => {
    const proposal = {
      action: 'keep',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = { propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }) };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);
    const correction = { action: 'act', taskDraft: { title: 'Review the budget for Luis' } };

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected', correction });

    expect(openVerdictStore(databasePath).loadAll()).toEqual([
      { messageId: 'message-1', decision: 'rejected', correction, decidedAt: '2026-11-02T15:10:00.000Z' },
    ]);
  });

  it('keeps out of GET /triage-queue after a backend restart on the same database file an item whose verdict was posted before it', async () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Luis asks for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks the user directly',
    };
    const triage = { propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }) };
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);
    await postTriageRun(beforeRestart);
    await postJson(beforeRestart, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });

    const afterRestart = createApp(options);
    const queue = await afterRestart.request('/triage-queue');

    expect(await queue.json()).toMatchObject({ action: [], groups: [] });
  });
  it('stores one confirm verdict for every item of a group confirmed whole at POST /group-verdicts, and none for items outside it', async () => {
    const expense = {
      action: 'archive',
      category: 'expense',
      summary: 'Receipt from Acme',
      extract: { vendor: 'Acme', amount: 120, currency: 'MXN', date: '2026-11-02' },
      reason: 'A receipt to file',
    };
    const sales = {
      action: 'keep',
      category: 'sales',
      summary: 'Globex pitches a CRM',
      extract: { company: 'Globex', solution: 'A CRM', problem: 'Scattered customer notes' },
      reason: 'A sales pitch',
    };
    const proposalsInOrder = [expense, sales, expense];
    const triage = {
      propose: () => Promise.resolve({ proposal: proposalsInOrder.shift(), costInUsd: 1, promptVersion: 'triage-v1' }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'receipt-newest', threadId: 'thread-1', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'pitch', threadId: 'thread-2', date: 'Mon, 2 Nov 2026 09:00:00 -0600' },
        { ...budgetReview, id: 'receipt-older', threadId: 'thread-3', date: 'Mon, 2 Nov 2026 08:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const response = await postJson(app, '/group-verdicts', { category: 'expense', decision: 'confirmed' });

    expect(response.status).toBe(200);
    const stored = openVerdictStore(databasePath).loadAll();
    expect(stored.map(({ messageId }) => messageId).sort()).toEqual(['receipt-newest', 'receipt-older']);
    expect(stored.every(({ decision }) => decision === 'confirmed')).toBe(true);
  });

  it("lists at GET /commands for the message's account an archive command with an id and the message id once its archive proposal is confirmed", async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);

    const response = await getCommands(app, 'ana@example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it('lists at GET /commands no archive command for an account other than the one whose message was confirmed for archive', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bea@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);

    const response = await getCommands(app, 'bea@example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands no archive command for an archive proposal that has no verdict yet', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await getCommands(app, 'ana@example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands no archive command for a keep proposal the user confirmed', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
    });
    await confirmBudgetReviewProposal(app);

    const response = await getCommands(app, 'ana@example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands two archive commands with distinct ids, each carrying its own message id, for two confirmed archives on one account', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [budgetReview, { ...budgetReview, id: 'message-2', threadId: 'thread-2' }],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    await postJson(app, '/verdicts', { messageId: 'message-2', decision: 'confirmed' });

    const response = await getCommands(app, 'ana@example.com');

    const { commands } = (await response.json()) as { commands: { id: string; messageId: string }[] };
    expect(commands.map(({ messageId }) => messageId).sort()).toEqual(['message-1', 'message-2']);
    expect(new Set(commands.map(({ id }) => id)).size).toBe(2);
  });

  it('lists at GET /commands no command once the extension acknowledged it through POST /commands/:id/acknowledgement', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);
    const pendingResponse = await getCommands(app, 'ana@example.com');
    const {
      commands: [command],
    } = (await pendingResponse.json()) as { commands: { id: string; messageId: string }[] };

    await app.request(`/commands/${command?.id ?? ''}/acknowledgement`, { method: 'POST' });

    const response = await getCommands(app, 'ana@example.com');
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands no command acknowledged before a backend restart', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage: ccThreadTriage('archive'),
    };
    const beforeRestart = createApp(options);
    await confirmBudgetReviewProposal(beforeRestart);
    const pendingResponse = await getCommands(beforeRestart, 'ana@example.com');
    const {
      commands: [command],
    } = (await pendingResponse.json()) as { commands: { id: string; messageId: string }[] };
    await beforeRestart.request(`/commands/${command?.id ?? ''}/acknowledgement`, { method: 'POST' });

    const afterRestart = createApp(options);
    const response = await getCommands(afterRestart, 'ana@example.com');

    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /tasks the title, Gmail link and account of a task stored when an act proposal is confirmed', async () => {
    const triage = {
      propose: () =>
        Promise.resolve({
          proposal: {
            action: 'act',
            category: 'action',
            summary: 'Luis asks for a budget review',
            extract: { asker: 'Luis', ask: 'Review the budget' },
            reason: 'Luis asks the user directly',
            taskDraft: { title: 'Review the budget by Friday' },
          },
          costInUsd: 1,
          promptVersion: 'triage-v1',
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await confirmBudgetReviewProposal(app);

    const response = await app.request('/tasks');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tasks: [
        {
          title: 'Review the budget by Friday',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
          accountEmail: 'ana@example.com',
        },
      ],
    });
  });

  it('lists at GET /check-later the company, Gmail link and account of a sales proposal the user confirmed to keep', async () => {
    const triage = {
      propose: () =>
        Promise.resolve({
          proposal: {
            action: 'keep',
            category: 'sales',
            summary: 'Acme pitches invoice automation',
            extract: { company: 'Acme', solution: 'Invoice automation', problem: 'Manual invoice entry' },
            reason: 'An unsolicited pitch that may be worth a look',
          },
          costInUsd: 1,
          promptVersion: 'triage-v1',
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await confirmBudgetReviewProposal(app);

    const response = await app.request('/check-later');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkLater: [
        {
          company: 'Acme',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
          accountEmail: 'ana@example.com',
        },
      ],
    });
  });

  it('includes in the GET /now badge count an action proposal waiting for a verdict', async () => {
    const triage = {
      propose: () =>
        Promise.resolve({
          proposal: {
            action: 'act',
            category: 'action',
            summary: 'Luis asks for a budget review',
            extract: { asker: 'Luis', ask: 'Review the budget' },
            reason: 'Luis asks the user directly',
            taskDraft: { title: 'Review the budget by Friday' },
          },
          costInUsd: 1,
          promptVersion: 'triage-v1',
        }),
    };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({ badgeCount: 1 });
  });
});
