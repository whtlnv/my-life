import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { healthResponse, triageCategories } from '@my-life/contracts';

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

const firstPendingFilterProposalId = async (app: App) => {
  const { proposals } = (await (await app.request('/filter-proposals')).json()) as { proposals: { id?: string }[] };
  return proposals[0]?.id ?? '';
};

const approveFilterProposal = (app: App, proposalId: string) =>
  app.request(`/filter-proposals/${proposalId}/approval`, { method: 'POST' });

const postAcknowledgement = (app: App, commandId: string) =>
  app.request(`/commands/${commandId}/acknowledgement`, { method: 'POST' });

const acknowledgeFilterCreation = (app: App, proposalId: string, gmailFilterId: string) =>
  app.request(`/commands/create-filter-${proposalId}/acknowledgement`, {
    method: 'POST',
    body: JSON.stringify({ gmailFilterId }),
  });

const switchCategory = (app: App, category: string, mode: string) =>
  app.request(`/categories/${category}/mode`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });

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

const triageAnswering = (proposal: unknown) => ({
  propose: () => Promise.resolve({ proposal, costInUsd: 1, promptVersion: 'triage-v1' }),
});

const triageAnsweringInOrder = (proposalsInOrder: unknown[], costInUsd: number) => ({
  propose: () => Promise.resolve({ proposal: proposalsInOrder.shift(), costInUsd, promptVersion: 'triage-v1' }),
});

const reportShopNewsletter = (app: App, messageId: string, subject = 'This week at the shop') =>
  postJson(app, '/mail-report', {
    accountEmail: 'ana@example.com',
    historyId: '1001',
    messages: [
      {
        id: messageId,
        threadId: messageId,
        from: 'Shop <news@shop.example.com>',
        to: 'ana@example.com',
        subject,
        date: 'Mon, 2 Nov 2026 09:00:00 -0600',
        snippet: 'New arrivals',
      },
    ],
  });

const reportTriageAndConfirmShopNewsletters = async (
  app: App,
  messageIds = ['newsletter-1', 'newsletter-2', 'newsletter-3'],
): Promise<void> => {
  for (const messageId of messageIds) {
    await reportShopNewsletter(app, messageId);
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId, decision: 'confirmed' });
  }
};

const triageRecordingAskedMessageIds = (askedMessageIds: string[], costInUsd = 0) => ({
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
      costInUsd,
      promptVersion: 'triage-v1',
    });
  },
});

const triageRecordingExamplesByMessageId = (examplesByMessageId: Map<string, unknown[] | undefined>) => ({
  propose: (message: { id: string }, examples?: unknown[]) => {
    examplesByMessageId.set(message.id, examples);
    return Promise.resolve({
      proposal: {
        action: 'archive',
        category: 'cc-thread',
        summary: 'Luis shared the budget with the team',
        extract: { sinceLastMessage: 'Luis shared the budget' },
        reason: 'The user is only copied',
      },
      costInUsd: 0,
      promptVersion: 'triage-v1',
    });
  },
});

const triageAnsweringByMessageId = (proposalByMessageId: Record<string, unknown>) => ({
  propose: (message: { id: string }) =>
    Promise.resolve({ proposal: proposalByMessageId[message.id], costInUsd: 0, promptVersion: 'triage-v1' }),
});

const filterAnswering = (proposal: unknown) => ({
  propose: () => Promise.resolve({ proposal, costInUsd: 0.05, promptVersion: 'filter-v1' }),
});

const filterRecordingAskedCandidates = (askedCandidates: unknown[], proposal: unknown, costInUsd = 0.05) => ({
  propose: (candidate: unknown) => {
    askedCandidates.push(candidate);
    return Promise.resolve({ proposal, costInUsd, promptVersion: 'filter-v1' });
  },
});

const ccThreadTriage = (action: 'archive' | 'keep') => {
  const proposal = {
    action,
    category: 'cc-thread',
    summary: 'Luis shared the budget with the team',
    extract: { sinceLastMessage: 'Luis shared the budget' },
    reason: 'The user is only copied',
  };
  return triageAnswering(proposal);
};

const budgetReviewActTriage = (taskDraft?: { title: string }) =>
  triageAnswering({
    action: 'act',
    category: 'action',
    summary: 'Luis asks for a budget review',
    extract: { asker: 'Luis', ask: 'Review the budget' },
    reason: 'Luis asks the user directly',
    ...(taskDraft && { taskDraft }),
  });

const shopNewsletterArchiveProposal = {
  action: 'archive',
  category: 'sales',
  summary: 'A shop newsletter',
  extract: {},
  reason: 'Promotional mail',
};

const shopNewsletterArchiveTriage = () => triageAnswering(shopNewsletterArchiveProposal);

const expenseInvoiceProposal = (vendor: string, date: string, amount = 100) => ({
  action: 'archive',
  category: 'expense',
  summary: `Invoice from ${vendor}`,
  extract: { vendor, amount, currency: 'MXN', date },
  reason: 'An invoice to file',
});

const proposeBudgetReview = async (app: App) => {
  await postJson(app, '/mail-report', budgetReviewReport);
  await postTriageRun(app);
};

const confirmBudgetReviewProposal = async (app: App) => {
  await proposeBudgetReview(app);
  await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
};

const statementVendors = async (response: Response) =>
  (await response.text())
    .split('\n')
    .slice(1)
    .filter((row) => row !== '')
    .map((row) => row.split(',')[0]);

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

  it('says when GET /triage-queue was fetched, from the clock', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const queue = await app.request('/triage-queue');

    expect(await queue.json()).toMatchObject({ fetchedAt: '2026-11-02T15:10:00.000Z' });
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
    const triage = triageRecordingAskedMessageIds(askedMessageIds);
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

  it('leaves every reported message untriaged and logs no spend at POST /triage-run when no triage port is configured', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);

    const run = await postTriageRun(app);
    const queue = await app.request('/triage-queue');

    expect(run.status).toBe(200);
    expect(await queue.json()).toMatchObject({ action: [], groups: [], remaining: 1, paused: false });
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

  it('hands triage at POST /triage-run the verdict on an earlier message from the same sender domain as an example when the sender has no verdicts', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await confirmBudgetReviewProposal(app);
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-2', threadId: 'thread-2', from: 'Marta <marta@example.com>', subject: 'Q4' },
      ],
    });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-2')).toEqual([
      expect.objectContaining({ messageId: 'message-1', decision: 'confirmed' }),
    ]);
  });

  it('does not hand triage at POST /triage-run the verdict on a same-domain message from another List-Id as an example', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, listId: '<finance.example.com>' }],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        {
          ...budgetReview,
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Marta <marta@example.com>',
          subject: 'Weekly newsletter',
          listId: '<newsletter.example.com>',
        },
      ],
    });

    await postTriageRun(app);

    expect(examplesByMessageId.get('message-2')).toEqual([]);
  });

  it('hands triage at POST /triage-run the same-sender verdicts as examples newest first, as the domain chooses them', async () => {
    const examplesByMessageId = new Map<string, unknown[] | undefined>();
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
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
    const triage = triageRecordingExamplesByMessageId(examplesByMessageId);
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
    const triage = triageRecordingAskedMessageIds(askedMessageIds);
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
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
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
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
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
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 10);
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

  it('resumes triage at POST /triage-run and reports GET /triage-queue unpaused once the running backend passes business midnight after reaching the ceiling', async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
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
    // 07:00Z on Nov 3 is 01:00 on Nov 3 in Mexico City: the next business day.
    currentTime = new Date('2026-11-03T07:00:00.000Z');

    await postTriageRun(app);
    const queue = await app.request('/triage-queue');

    expect(askedMessageIds).toEqual(['message-newest', 'message-middle', 'message-older']);
    expect(await queue.json()).toMatchObject({ paused: false });
  });

  it('keeps triage paused at POST /triage-run and GET /triage-queue later the same business day after reaching the ceiling, even once the UTC date has changed', async () => {
    const askedMessageIds: string[] = [];
    const triage = triageRecordingAskedMessageIds(askedMessageIds, 12);
    // 23:30Z on Nov 2 is 17:30 on Nov 2 in Mexico City.
    let currentTime = new Date('2026-11-02T23:30:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
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
    // 01:00Z on Nov 3 is 19:00 on Nov 2 in Mexico City: still the same business day.
    currentTime = new Date('2026-11-03T01:00:00.000Z');

    await postTriageRun(app);
    const queue = await app.request('/triage-queue');

    expect(askedMessageIds).toEqual(['message-newest', 'message-middle']);
    expect(await queue.json()).toMatchObject({ paused: true });
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
    const triage = triageAnsweringInOrder(proposalsInOrder, 12);
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
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
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
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
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

  it('groups in GET /triage-queue under cc-thread, not in the action block, an action proposal for a message whose to and cc do not contain the reporting account', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks the team for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks for a review',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, to: 'team@example.com', cc: 'pedro@example.com' }],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { action, groups } = (await queue.json()) as {
      action: { messageId: string }[];
      groups: { category: string; items: { messageId: string }[] }[];
    };
    expect(action).toEqual([]);
    expect(groups.find(({ category }) => category === 'cc-thread')).toMatchObject({
      items: [{ messageId: 'message-1' }],
    });
  });

  it('still groups in GET /triage-queue under cc-thread, after a backend restart on the same database file, an action proposal for a message whose to and cc do not contain the reporting account', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks the team for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks for a review',
    });
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(beforeRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, to: 'team@example.com', cc: 'pedro@example.com' }],
    });
    await postTriageRun(beforeRestart);

    const afterRestart = createApp(options);
    const queue = await afterRestart.request('/triage-queue');

    const { action, groups } = (await queue.json()) as {
      action: { messageId: string }[];
      groups: { category: string; items: { messageId: string }[] }[];
    };
    expect(action).toEqual([]);
    expect(groups.find(({ category }) => category === 'cc-thread')).toMatchObject({
      items: [{ messageId: 'message-1' }],
    });
  });

  it('groups in GET /triage-queue under cc-thread an action proposal for a message where the reporting account is only in cc, not in to', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks the team for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks for a review',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, to: 'team@example.com', cc: 'ana@example.com' }],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { action, groups } = (await queue.json()) as {
      action: { messageId: string }[];
      groups: { category: string; items: { messageId: string }[] }[];
    };
    expect(action).toEqual([]);
    expect(groups.find(({ category }) => category === 'cc-thread')).toMatchObject({
      items: [{ messageId: 'message-1' }],
    });
  });

  it('keeps in the action block of GET /triage-queue an action proposal for a message whose To header names the reporting account with a display name and different letter case', async () => {
    const triage = triageAnswering({
      action: 'act',
      category: 'action',
      summary: 'Luis asks Ana for a budget review',
      extract: { asker: 'Luis', ask: 'Review the budget' },
      reason: 'Luis asks Ana for a review',
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [{ ...budgetReview, to: 'Ana López <Ana@Example.com>' }],
    });
    await postTriageRun(app);

    const queue = await app.request('/triage-queue');

    const { action } = (await queue.json()) as { action: { messageId: string }[] };
    expect(action).toMatchObject([{ messageId: 'message-1' }]);
  });

  it('says in GET /triage-queue which account each item came from and links to the message in Gmail for that account', async () => {
    const triage = budgetReviewActTriage();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

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
    const triage = triageAnswering(proposal);
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    await proposeBudgetReview(beforeRestart);

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
    const triage = triageAnswering(proposal);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

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
    const triage = budgetReviewActTriage();
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await proposeBudgetReview(app);

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
    const triage = triageAnswering(proposal);
    const databasePath = temporaryDatabasePath();
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage });
    await proposeBudgetReview(app);
    const correction = { action: 'act', taskDraft: { title: 'Review the budget for Luis' } };

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected', correction });

    expect(openVerdictStore(databasePath).loadAll()).toEqual([
      { messageId: 'message-1', decision: 'rejected', correction, decidedAt: '2026-11-02T15:10:00.000Z' },
    ]);
  });

  it('keeps out of GET /triage-queue after a backend restart on the same database file an item whose verdict was posted before it', async () => {
    const triage = budgetReviewActTriage();
    const databasePath = temporaryDatabasePath();
    const options = { allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath, triage };
    const beforeRestart = createApp(options);
    await confirmBudgetReviewProposal(beforeRestart);

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
    const triage = triageAnsweringInOrder(proposalsInOrder, 1);
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
    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it.each([
    {
      rule: 'for an account other than the one whose message was confirmed for archive',
      action: 'archive',
      decide: confirmBudgetReviewProposal,
      accountEmail: 'bea@example.com',
    },
    {
      rule: 'for an archive proposal that has no verdict yet',
      action: 'archive',
      decide: proposeBudgetReview,
      accountEmail: 'ana@example.com',
    },
    {
      rule: 'for a keep proposal the user confirmed',
      action: 'keep',
      decide: confirmBudgetReviewProposal,
      accountEmail: 'ana@example.com',
    },
  ] as const)('lists at GET /commands no archive command $rule', async ({ action, decide, accountEmail }) => {
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bea@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage(action),
    });
    await decide(app);

    const response = await getCommands(app, accountEmail);

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

  it('lists at GET /commands no archive command once its confirmed archive proposal is re-decided as rejected through POST /verdicts', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(app);
    currentTime = new Date('2026-11-02T15:11:00.000Z');

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });

    const response = await getCommands(app, 'ana@example.com');
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /commands the archive command once its rejected archive proposal is re-decided as confirmed through POST /verdicts', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      triage: ccThreadTriage('archive'),
    });
    await proposeBudgetReview(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });
    currentTime = new Date('2026-11-02T15:11:00.000Z');

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });

    const response = await getCommands(app, 'ana@example.com');
    expect(await response.json()).toMatchObject({ commands: [{ id: 'archive-message-1', messageId: 'message-1' }] });
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

    await postAcknowledgement(app, command?.id ?? '');

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
    await postAcknowledgement(beforeRestart, command?.id ?? '');

    const afterRestart = createApp(options);
    const response = await getCommands(afterRestart, 'ana@example.com');

    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists at GET /tasks the title, Gmail link and account of a task stored when an act proposal is confirmed', async () => {
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
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

  it('lists at GET /tasks no task once its confirmed act proposal is re-decided as rejected through POST /verdicts', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => currentTime }, triage });
    await confirmBudgetReviewProposal(app);
    currentTime = new Date('2026-11-02T15:11:00.000Z');

    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });

    const response = await app.request('/tasks');
    expect(await response.json()).toEqual({ tasks: [] });
  });

  it('lists at GET /check-later the company, Gmail link and account of a sales proposal the user confirmed to keep', async () => {
    const triage = triageAnswering({
      action: 'keep',
      category: 'sales',
      summary: 'Acme pitches invoice automation',
      extract: { company: 'Acme', solution: 'Invoice automation', problem: 'Manual invoice entry' },
      reason: 'An unsolicited pitch that may be worth a look',
    });
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
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await proposeBudgetReview(app);

    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({ badgeCount: 1 });
  });

  it('lists at GET /categories every triage category with mode advise when none has been switched', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const response = await app.request('/categories');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('shows at GET /categories a category switched to automatic through PUT /categories/:category/mode, and every other category still advise', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    await switchCategory(app, 'sales', 'automatic');
    const response = await app.request('/categories');

    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({
        category,
        mode: category === 'sales' ? 'automatic' : 'advise',
      })),
    });
  });

  it('shows at GET /categories a category switched back to advise through PUT /categories/:category/mode after being automatic', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await switchCategory(app, 'sales', 'automatic');
    await switchCategory(app, 'sales', 'advise');
    const response = await app.request('/categories');

    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('answers 400 to PUT /categories/:category/mode with an unknown category or an unknown mode, and GET /categories still shows every category advise', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const unknownCategory = await switchCategory(app, 'newsletters', 'automatic');
    const unknownMode = await switchCategory(app, 'sales', 'sometimes');
    const response = await app.request('/categories');

    expect([unknownCategory.status, unknownMode.status]).toEqual([400, 400]);
    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('still shows at GET /categories a category switched to automatic before a backend restart on the same database file', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp(options);
    await switchCategory(beforeRestart, 'sales', 'automatic');

    const afterRestart = createApp(options);
    const response = await afterRestart.request('/categories');

    expect(await response.json()).toMatchObject({
      categories: triageCategories.map((category) => ({
        category,
        mode: category === 'sales' ? 'automatic' : 'advise',
      })),
    });
  });

  it('returns every automatic category to advise through POST /categories/kill-switch', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await switchCategory(app, 'sales', 'automatic');
    await switchCategory(app, 'expense', 'automatic');

    const response = await app.request('/categories/kill-switch', { method: 'POST' });
    const categories = await app.request('/categories');

    expect(response.status).toBe(200);
    expect(await categories.json()).toMatchObject({
      categories: triageCategories.map((category) => ({ category, mode: 'advise' })),
    });
  });

  it('shows at GET /categories the agreement rate of a category as its confirmed verdicts divided by its proposals, a rejection or a correction counting as not confirmed', async () => {
    const sales = {
      action: 'keep',
      category: 'sales',
      summary: 'Globex pitches a CRM',
      extract: { company: 'Globex', solution: 'A CRM', problem: 'Scattered customer notes' },
      reason: 'A sales pitch',
    };
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: triageAnswering(sales),
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: ['pitch-confirmed', 'pitch-rejected', 'pitch-corrected', 'pitch-undecided'].map((id) => ({
        ...budgetReview,
        id,
        threadId: id,
      })),
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'pitch-confirmed', decision: 'confirmed' });
    await postJson(app, '/verdicts', { messageId: 'pitch-rejected', decision: 'rejected' });
    await postJson(app, '/verdicts', {
      messageId: 'pitch-corrected',
      decision: 'rejected',
      correction: { action: 'archive' },
    });

    const response = await app.request('/categories');

    const { categories } = (await response.json()) as { categories: { category: string }[] };
    expect(categories.find(({ category }) => category === 'sales')).toMatchObject({
      category: 'sales',
      mode: 'advise',
      agreementRate: 0.25,
    });
  });

  it("lists at GET /categories a category's five most recent proposals, newest first, each with its summary, action, account and link", async () => {
    const triage = {
      propose: (message: { subject: string }) =>
        Promise.resolve({
          proposal: {
            action: 'keep',
            category: 'sales',
            summary: `${message.subject} pitches a CRM`,
            extract: { company: message.subject, solution: 'A CRM', problem: 'Scattered customer notes' },
            reason: 'A sales pitch',
          },
          costInUsd: 0,
          promptVersion: 'triage-v1',
        }),
    };
    let now = new Date('2026-11-02T15:10:00.000Z');
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: { now: () => now }, triage });
    const [budgetReview] = budgetReviewReport.messages;
    for (const index of [1, 2, 3, 4, 5, 6]) {
      const id = `pitch-${String(index)}`;
      await postJson(app, '/mail-report', {
        ...budgetReviewReport,
        messages: [{ ...budgetReview, id, threadId: id, subject: `Vendor ${String(index)}` }],
      });
      await postTriageRun(app);
      now = new Date(now.getTime() + 60 * 1000);
    }

    const response = await app.request('/categories');

    const { categories } = (await response.json()) as { categories: { category: string }[] };
    expect(categories.find(({ category }) => category === 'sales')).toMatchObject({
      recentProposals: [6, 5, 4, 3, 2].map((index) => ({
        summary: `Vendor ${String(index)} pitches a CRM`,
        action: 'keep',
        accountEmail: 'ana@example.com',
        link: `https://mail.google.com/mail/?authuser=ana%40example.com#all/pitch-${String(index)}`,
      })),
    });
  });

  it('lists at GET /commands an archive command with no verdict for a new archive proposal in a category switched to automatic', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it('lists at GET /tasks with no verdict the task of a new act proposal in a category switched to automatic', async () => {
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await switchCategory(app, 'action', 'automatic');
    await proposeBudgetReview(app);

    const response = await app.request('/tasks');

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

  it('lists neither a command at GET /commands nor a task at GET /tasks for a new keep proposal in a category switched to automatic', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('keep'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);

    const commands = await getCommands(app, 'ana@example.com');
    const tasks = await app.request('/tasks');

    expect({ commands: await commands.json(), tasks: await tasks.json() }).toEqual({
      commands: { commands: [] },
      tasks: { tasks: [] },
    });
  });

  it('still lists at GET /commands the archive command of an archive proposal made while its category was automatic, after the category is switched back to advise', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);
    await switchCategory(app, 'cc-thread', 'advise');

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it('lists no archive command at GET /commands for an archive proposal made while its category was automatic that the user then rejects at POST /verdicts', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await proposeBudgetReview(app);
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'rejected' });

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toEqual({ commands: [] });
  });

  it('lists no archive command at GET /commands for an archive proposal made while its category was advise, after the category is switched to automatic', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await proposeBudgetReview(app);
    await switchCategory(app, 'cc-thread', 'automatic');

    const response = await getCommands(app, 'ana@example.com');

    expect(await response.json()).toEqual({ commands: [] });
  });

  it('still lists at GET /commands with no verdict the archive command of a proposal made while its category was automatic, after a backend restart on the same database file', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage: ccThreadTriage('archive'),
    };
    const beforeRestart = createApp(options);
    await switchCategory(beforeRestart, 'cc-thread', 'automatic');
    await proposeBudgetReview(beforeRestart);

    const response = await getCommands(createApp(options), 'ana@example.com');

    expect(await response.json()).toMatchObject({
      commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }],
    });
  });

  it('lists no archive command at GET /commands for a new archive proposal in a category that was automatic before POST /categories/kill-switch, until it is confirmed', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(app, 'cc-thread', 'automatic');
    await app.request('/categories/kill-switch', { method: 'POST' });
    await proposeBudgetReview(app);

    const beforeConfirmation = await getCommands(app, 'ana@example.com');
    await postJson(app, '/verdicts', { messageId: 'message-1', decision: 'confirmed' });
    const afterConfirmation = await getCommands(app, 'ana@example.com');

    expect({
      beforeConfirmation: await beforeConfirmation.json(),
      afterConfirmation: await afterConfirmation.json(),
    }).toMatchObject({
      beforeConfirmation: { commands: [] },
      afterConfirmation: { commands: [{ id: expect.any(String) as unknown, messageId: 'message-1' }] },
    });
  });

  it('labels at GET /commands an archive command issued automatically my-life/auto and one issued after a confirmation my-life/archived', async () => {
    const automaticApp = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await switchCategory(automaticApp, 'cc-thread', 'automatic');
    await proposeBudgetReview(automaticApp);
    const confirmedApp = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: ccThreadTriage('archive'),
    });
    await confirmBudgetReviewProposal(confirmedApp);

    const automatic = await getCommands(automaticApp, 'ana@example.com');
    const confirmed = await getCommands(confirmedApp, 'ana@example.com');

    expect({ automatic: await automatic.json(), confirmed: await confirmed.json() }).toMatchObject({
      automatic: { commands: [{ messageId: 'message-1', label: 'my-life/auto' }] },
      confirmed: { commands: [{ messageId: 'message-1', label: 'my-life/archived' }] },
    });
  });

  it('keeps out of GET /triage-queue and out of the GET /now badge count an act proposal acted on automatically in a category switched to automatic', async () => {
    const triage = budgetReviewActTriage({ title: 'Review the budget by Friday' });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await switchCategory(app, 'action', 'automatic');
    await proposeBudgetReview(app);

    const queue = await app.request('/triage-queue');
    const now = await app.request('/now');

    expect({ queue: await queue.json(), now: await now.json() }).toMatchObject({
      queue: { action: [] },
      now: { badgeCount: 0 },
    });
  });
  it('asks the filter port once for a proposal when a filter candidate appears and stores it with the account, the candidate messages, the prompt version and the time, without asking again about the same candidate', async () => {
    const filterProposal = {
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop newsletters',
      skipInbox: true,
    };
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, filterProposal);
    const triage = shopNewsletterArchiveTriage();
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage,
      filter,
    });
    await reportTriageAndConfirmShopNewsletters(app, ['newsletter-1', 'newsletter-2', 'newsletter-3', 'newsletter-4']);
    const { openFilterProposalStore } = await import('./filter-proposal-store');

    expect({ askedCandidates, stored: openFilterProposalStore(databasePath).loadAll() }).toMatchObject({
      askedCandidates: [
        {
          accountEmail: 'ana@example.com',
          criteria: { from: 'Shop <news@shop.example.com>' },
          messageIds: ['newsletter-1', 'newsletter-2', 'newsletter-3'],
        },
      ],
      stored: [
        {
          accountEmail: 'ana@example.com',
          messageIds: ['newsletter-1', 'newsletter-2', 'newsletter-3'],
          promptVersion: 'filter-v1',
          proposedAt: '2026-11-02T15:10:00.000Z',
          proposal: filterProposal,
        },
      ],
    });
  });

  it('does not ask the filter port again after a backend restart on the same database file about a candidate whose filter proposal was stored before it', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, {
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop newsletters',
      skipInbox: true,
    });
    const triage = shopNewsletterArchiveTriage();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
      filter,
    };
    const beforeRestart = createApp(options);
    for (const messageId of ['newsletter-1', 'newsletter-2', 'newsletter-3', 'newsletter-4']) {
      await reportShopNewsletter(beforeRestart, messageId);
      await postTriageRun(beforeRestart);
      if (messageId !== 'newsletter-4') {
        await postJson(beforeRestart, '/verdicts', { messageId, decision: 'confirmed' });
      }
    }
    askedCandidates.length = 0;
    const afterRestart = createApp(options);

    await postJson(afterRestart, '/verdicts', { messageId: 'newsletter-4', decision: 'confirmed' });

    expect(askedCandidates).toMatchObject([]);
  });

  it('asks the filter port, also after a backend restart on the same database file, with each candidate message carrying its sender and subject as reported', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, {
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop newsletters',
      skipInbox: true,
    });
    const triage = shopNewsletterArchiveTriage();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
      filter,
    };
    const subjects = { 'newsletter-1': 'New arrivals', 'newsletter-2': 'Winter sale', 'newsletter-3': 'Last chance' };
    const beforeRestart = createApp(options);
    for (const [messageId, subject] of Object.entries(subjects)) {
      await reportShopNewsletter(beforeRestart, messageId, subject);
      await postTriageRun(beforeRestart);
      if (messageId !== 'newsletter-3') {
        await postJson(beforeRestart, '/verdicts', { messageId, decision: 'confirmed' });
      }
    }
    const afterRestart = createApp(options);

    await postJson(afterRestart, '/verdicts', { messageId: 'newsletter-3', decision: 'confirmed' });

    expect(askedCandidates).toMatchObject([
      {
        messages: [
          { from: 'Shop <news@shop.example.com>', subject: 'New arrivals' },
          { from: 'Shop <news@shop.example.com>', subject: 'Winter sale' },
          { from: 'Shop <news@shop.example.com>', subject: 'Last chance' },
        ],
      },
    ]);
  });

  it('counts toward a filter candidate only archives: a confirmed keep proposal does not count, while a rejected proposal corrected to archive does', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, {
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop',
      skipInbox: true,
    });
    const proposalWith = (action: string) => ({
      action,
      category: 'sales',
      summary: 'A shop newsletter',
      extract: {},
      reason: 'Promotional mail',
    });
    const decisions = [
      { messageId: 'newsletter-1', action: 'archive', verdict: { decision: 'confirmed' } },
      { messageId: 'newsletter-2', action: 'keep', verdict: { decision: 'confirmed' } },
      { messageId: 'newsletter-3', action: 'archive', verdict: { decision: 'confirmed' } },
      {
        messageId: 'newsletter-4',
        action: 'keep',
        verdict: { decision: 'rejected', correction: { action: 'archive' } },
      },
    ];
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: triageAnsweringInOrder(
        decisions.map(({ action }) => proposalWith(action)),
        0,
      ),
      filter,
    });
    for (const { messageId, verdict } of decisions) {
      await reportShopNewsletter(app, messageId);
      await postTriageRun(app);
      await postJson(app, '/verdicts', { messageId, ...verdict });
    }

    expect(askedCandidates).toMatchObject([
      {
        accountEmail: 'ana@example.com',
        criteria: { from: 'Shop <news@shop.example.com>' },
        messageIds: ['newsletter-1', 'newsletter-3', 'newsletter-4'],
      },
    ]);
  });

  it('logs each filter-port call as spend, so a filter proposal that brings the day to the ceiling pauses triage at GET /triage-queue', async () => {
    const filter = {
      propose: () =>
        Promise.resolve({
          proposal: { criteria: { from: 'news@shop.example.com' }, labelName: 'Shop', skipInbox: true },
          costInUsd: 17,
          promptVersion: 'filter-v1',
        }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      databasePath,
      triage: triageAnsweringInOrder(
        [shopNewsletterArchiveProposal, shopNewsletterArchiveProposal, shopNewsletterArchiveProposal],
        1,
      ),
      filter,
    });
    await reportTriageAndConfirmShopNewsletters(app);

    const queue = await app.request('/triage-queue');

    expect({
      loggedCosts: openSpendStore(databasePath)
        .loadAll()
        .map(({ costInUsd }) => costInUsd),
      queue: await queue.json(),
    }).toMatchObject({ loggedCosts: [1, 1, 1, 17], queue: { paused: true } });
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
    const triage = triageAnsweringInOrder([expenseProposal, systemUpdateProposal], 1);
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

  it('does not ask the filter port for a proposal when a filter candidate appears while triage is paused by the daily spend ceiling', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(
      askedCandidates,
      { criteria: { from: 'news@shop.example.com' }, labelName: 'Shop', skipInbox: true },
      1,
    );
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      triage: triageAnsweringInOrder(
        [shopNewsletterArchiveProposal, shopNewsletterArchiveProposal, shopNewsletterArchiveProposal],
        7,
      ),
      filter,
    });
    await reportTriageAndConfirmShopNewsletters(app);

    expect(askedCandidates).toMatchObject([]);
  });

  function appProposingShopNewslettersFilter() {
    const filter = filterAnswering({
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop newsletters',
      skipInbox: true,
    });
    const triage = shopNewsletterArchiveTriage();
    return createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, filter });
  }

  it('lists at GET /filter-proposals each pending filter proposal with its criteria, label, account and the count of archives behind it', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app, ['newsletter-1', 'newsletter-2', 'newsletter-3']);

    const response = await app.request('/filter-proposals');

    expect({ status: response.status, body: await response.json() }).toMatchObject({
      status: 200,
      body: {
        proposals: [
          {
            criteria: { from: 'news@shop.example.com' },
            labelName: 'Shop newsletters',
            accountEmail: 'ana@example.com',
            archiveCount: 3,
          },
        ],
      },
    });
  });

  it('lists at GET /commands for the account a create-filter command with the criteria and label once its filter proposal is approved through POST /filter-proposals/:id/approval', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);

    const approval = await approveFilterProposal(app, proposalId);
    const commands = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };

    expect({ status: approval.status, commands: commands.commands }).toMatchObject({
      status: 200,
      commands: expect.arrayContaining([
        expect.objectContaining({
          type: 'create-filter',
          criteria: { from: 'news@shop.example.com' },
          labelName: 'Shop newsletters',
        }),
      ]) as unknown,
    });
  });

  it('still lists at GET /commands the create-filter command of a filter proposal approved before a backend restart on the same database file', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering({
        criteria: { from: 'news@shop.example.com' },
        labelName: 'Shop newsletters',
        skipInbox: true,
      }),
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    await approveFilterProposal(beforeRestart, proposalId);
    const afterRestart = createApp(options);

    const commands = (await (await getCommands(afterRestart, 'ana@example.com')).json()) as {
      commands: { type?: string; id?: string }[];
    };

    expect(commands.commands.filter(({ type }) => type === 'create-filter')).toMatchObject([
      { id: `create-filter-${proposalId}`, criteria: { from: 'news@shop.example.com' }, labelName: 'Shop newsletters' },
    ]);
  });

  it('lists no create-filter command at GET /commands for a pending filter proposal that was never approved', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);

    const listed = (await (await app.request('/filter-proposals')).json()) as { proposals: unknown[] };
    const commands = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { type?: string }[] };

    expect({
      pendingProposals: listed.proposals.length,
      createFilterCommands: commands.commands.filter(({ type }) => type === 'create-filter'),
    }).toEqual({ pendingProposals: 1, createFilterCommands: [] });
  });

  it('lists at GET /commands a create-filter command with the id create-filter-<proposal id>, and no longer lists it once acknowledged through POST /commands/:id/acknowledgement', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    const createFilterCommands = async () =>
      (
        (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { type?: string; id?: string }[] }
      ).commands.filter(({ type }) => type === 'create-filter');

    const [command] = await createFilterCommands();
    await postAcknowledgement(app, command?.id ?? '');

    expect({ id: command?.id, afterAcknowledgement: await createFilterCommands() }).toEqual({
      id: `create-filter-${proposalId}`,
      afterAcknowledgement: [],
    });
  });

  it('lists at GET /filters a filter only once its create-filter command is acknowledged, with its criteria, label, account and the Gmail filter id', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    const listFilters = async () => {
      const response = await app.request('/filters');
      return { status: response.status, body: response.ok ? await response.json() : undefined };
    };

    const beforeAcknowledgement = await listFilters();
    await acknowledgeFilterCreation(app, proposalId, 'gmail-filter-1');
    const afterAcknowledgement = await listFilters();

    expect({ beforeAcknowledgement, afterAcknowledgement }).toEqual({
      beforeAcknowledgement: { status: 200, body: { filters: [] } },
      afterAcknowledgement: {
        status: 200,
        body: {
          filters: [
            expect.objectContaining({
              criteria: { from: 'news@shop.example.com' },
              labelName: 'Shop newsletters',
              accountEmail: 'ana@example.com',
              gmailFilterId: 'gmail-filter-1',
            }),
          ],
        },
      },
    });
  });

  it('says at GET /filters when each filter was approved and when its creation was acknowledged, from the clock at each event, also after a backend restart on the same database file', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      databasePath: temporaryDatabasePath(),
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering({
        criteria: { from: 'news@shop.example.com' },
        labelName: 'Shop newsletters',
        skipInbox: true,
      }),
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    currentTime = new Date('2026-11-02T15:20:00.000Z');
    await approveFilterProposal(beforeRestart, proposalId);
    currentTime = new Date('2026-11-02T15:25:00.000Z');
    await acknowledgeFilterCreation(beforeRestart, proposalId, 'gmail-filter-1');
    currentTime = new Date('2026-11-02T16:00:00.000Z');
    const afterRestart = createApp(options);

    const response = await afterRestart.request('/filters');

    expect(await response.json()).toEqual({
      filters: [
        expect.objectContaining({
          gmailFilterId: 'gmail-filter-1',
          approvedAt: '2026-11-02T15:20:00.000Z',
          acknowledgedAt: '2026-11-02T15:25:00.000Z',
        }),
      ],
    });
  });

  it('yields after DELETE /filters/:id a delete-filter command with the Gmail filter id at GET /commands for that filter account only', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    await acknowledgeFilterCreation(app, proposalId, 'gmail-filter-1');
    const deleteFilterCommands = async (accountEmail: string) =>
      ((await (await getCommands(app, accountEmail)).json()) as { commands: { type?: string }[] }).commands.filter(
        ({ type }) => type === 'delete-filter',
      );

    const deletion = await app.request('/filters/gmail-filter-1', { method: 'DELETE' });

    expect({
      status: deletion.status,
      filterAccount: await deleteFilterCommands('ana@example.com'),
      otherAccount: await deleteFilterCommands('bruno@example.com'),
    }).toEqual({
      status: 200,
      filterAccount: [expect.objectContaining({ type: 'delete-filter', gmailFilterId: 'gmail-filter-1' })],
      otherAccount: [],
    });
  });

  it('drops the filter from GET /filters and its delete-filter command from GET /commands once that command is acknowledged', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    await acknowledgeFilterCreation(app, proposalId, 'gmail-filter-1');
    await app.request('/filters/gmail-filter-1', { method: 'DELETE' });
    const deleteFilterCommand = (
      (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { id: string; type?: string }[] }
    ).commands.find(({ type }) => type === 'delete-filter');

    await postAcknowledgement(app, deleteFilterCommand?.id ?? '');

    expect({
      filters: ((await (await app.request('/filters')).json()) as { filters: unknown[] }).filters,
      deleteFilterCommands: (
        (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { type?: string }[] }
      ).commands.filter(({ type }) => type === 'delete-filter'),
    }).toEqual({ filters: [], deleteFilterCommands: [] });
  });

  it('still lists at GET /commands the delete-filter command of a deletion requested before a backend restart on the same database file, with the time the deletion was requested', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      databasePath: temporaryDatabasePath(),
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering({
        criteria: { from: 'news@shop.example.com' },
        labelName: 'Shop newsletters',
        skipInbox: true,
      }),
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    await approveFilterProposal(beforeRestart, proposalId);
    await acknowledgeFilterCreation(beforeRestart, proposalId, 'gmail-filter-1');
    currentTime = new Date('2026-11-02T15:30:00.000Z');
    await beforeRestart.request('/filters/gmail-filter-1', { method: 'DELETE' });
    currentTime = new Date('2026-11-02T16:00:00.000Z');
    const afterRestart = createApp(options);

    const commands = (await (await getCommands(afterRestart, 'ana@example.com')).json()) as {
      commands: { type?: string }[];
    };

    expect(commands.commands.filter(({ type }) => type === 'delete-filter')).toEqual([
      {
        id: 'delete-filter-gmail-filter-1',
        type: 'delete-filter',
        gmailFilterId: 'gmail-filter-1',
        requestedAt: '2026-11-02T15:30:00.000Z',
      },
    ]);
  });

  it('no longer lists at GET /filter-proposals a filter proposal rejected through POST /filter-proposals/:id/rejection', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);

    const rejection = await app.request(`/filter-proposals/${proposalId}/rejection`, {
      method: 'POST',
    });
    const afterRejection = (await (await app.request('/filter-proposals')).json()) as { proposals: unknown[] };

    expect({ status: rejection.status, proposals: afterRejection.proposals }).toEqual({ status: 200, proposals: [] });
  });

  it('no longer lists at GET /filter-proposals a filter proposal approved through POST /filter-proposals/:id/approval', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);

    const approval = await approveFilterProposal(app, proposalId);
    const afterApproval = (await (await app.request('/filter-proposals')).json()) as { proposals: unknown[] };

    expect({ status: approval.status, proposals: afterApproval.proposals }).toEqual({ status: 200, proposals: [] });
  });

  it('neither asks the filter port again nor lists a proposal at GET /filter-proposals for further confirmed archives from a sender whose filter proposal was rejected, also after a backend restart on the same database file', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, {
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop newsletters',
      skipInbox: true,
    });
    const triage = shopNewsletterArchiveTriage();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
      filter,
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    await beforeRestart.request(`/filter-proposals/${proposalId}/rejection`, { method: 'POST' });
    askedCandidates.length = 0;
    const afterRestart = createApp(options);

    await reportTriageAndConfirmShopNewsletters(afterRestart, ['newsletter-4', 'newsletter-5']);
    const afterRejection = (await (await afterRestart.request('/filter-proposals')).json()) as { proposals: unknown[] };

    expect({ askedCandidates, proposals: afterRejection.proposals }).toEqual({ askedCandidates: [], proposals: [] });
  });

  it("answers GET /expense-statement?week= with a CSV attachment of the week's expenses, quoting commas and quotes", async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-acme': expenseInvoiceProposal('Acme, Inc.', '2026-11-02', 120),
      'message-tacos': expenseInvoiceProposal('Tacos "El Güero"', '2026-11-03', 85.5),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-acme', threadId: 'thread-acme', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-tacos', threadId: 'thread-tacos', date: 'Tue, 3 Nov 2026 10:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const response = await app.request('/expense-statement?week=2026-11-02');

    const link = (messageId: string) => `https://mail.google.com/mail/?authuser=ana%40example.com#all/${messageId}`;
    expect({
      status: response.status,
      contentType: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
      body: await response.text(),
    }).toEqual({
      status: 200,
      contentType: expect.stringContaining('text/csv') as unknown,
      disposition: expect.stringContaining('attachment') as unknown,
      body: [
        'vendor,amount,currency,date,account,link',
        `"Acme, Inc.",120,MXN,2026-11-02,ana@example.com,${link('message-acme')}`,
        `"Tacos ""El Güero""",85.5,MXN,2026-11-03,ana@example.com,${link('message-tacos')}`,
        '',
      ].join('\n'),
    });
  });

  it('answers GET /expense-statement without week with the current business week', async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-last-week': expenseInvoiceProposal('Last week', '2026-10-30'),
      'message-this-week': expenseInvoiceProposal('This week', '2026-11-03'),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const thursdayInMexicoCity = { now: () => new Date('2026-11-05T18:00:00.000Z') };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: thursdayInMexicoCity, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-last-week', threadId: 'thread-last', date: 'Fri, 30 Oct 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-this-week', threadId: 'thread-this', date: 'Tue, 3 Nov 2026 10:00:00 -0600' },
      ],
    });
    await postTriageRun(app);

    const response = await app.request('/expense-statement');

    const vendors = await statementVendors(response);
    expect(vendors).toEqual(['This week']);
  });

  it('leaves out of GET /expense-statement an expense proposal the user rejected through POST /verdicts', async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-kept': expenseInvoiceProposal('Kept', '2026-11-02'),
      'message-rejected': expenseInvoiceProposal('Rejected', '2026-11-03'),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-kept', threadId: 'thread-kept', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
        {
          ...budgetReview,
          id: 'message-rejected',
          threadId: 'thread-rejected',
          date: 'Tue, 3 Nov 2026 10:00:00 -0600',
        },
      ],
    });
    await postTriageRun(app);
    await postJson(app, '/verdicts', { messageId: 'message-rejected', decision: 'rejected' });

    const response = await app.request('/expense-statement?week=2026-11-02');

    const vendors = await statementVendors(response);
    expect(vendors).toEqual(['Kept']);
  });

  it("still lists in GET /expense-statement the week's expenses, in message-date order, after a backend restart on the same database file", async () => {
    const proposalByMessageId: Record<string, unknown> = {
      'message-tuesday': expenseInvoiceProposal('Tuesday', '2026-11-03'),
      'message-monday': expenseInvoiceProposal('Monday', '2026-11-02'),
    };
    const triage = triageAnsweringByMessageId(proposalByMessageId);
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
    };
    const beforeRestart = createApp(options);
    const [budgetReview] = budgetReviewReport.messages;
    await postJson(beforeRestart, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-tuesday', threadId: 'thread-tuesday', date: 'Tue, 3 Nov 2026 10:00:00 -0600' },
        { ...budgetReview, id: 'message-monday', threadId: 'thread-monday', date: 'Mon, 2 Nov 2026 10:00:00 -0600' },
      ],
    });
    await postTriageRun(beforeRestart);
    const afterRestart = createApp(options);

    const response = await afterRestart.request('/expense-statement?week=2026-11-02');

    const vendors = await statementVendors(response);
    expect(vendors).toEqual(['Monday', 'Tuesday']);
  });
});
