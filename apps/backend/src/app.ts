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
  triageEffects,
  triageQueue,
  type CalendarSnapshot,
  type Clock,
} from '@my-life/domain';

import { openAcknowledgementStore } from './acknowledgement-store';
import { openCalendarSnapshotStore, type StoredCalendarSnapshot } from './calendar-snapshot-store';
import { openMailSourceStore } from './mail-source-store';
import { openProposalStore } from './proposal-store';
import { openReportedMessageStore } from './reported-message-store';
import { openSpendStore } from './spend-store';
import { openVerdictStore } from './verdict-store';

interface ReportedMessage {
  id: string;
  from: string;
  date: string;
}

type Proposal = Parameters<typeof triageQueue>[0][number];

interface TriageResult {
  costInUsd?: number;
  model?: string;
  proposal?: unknown;
  promptVersion?: string;
}

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  dailySpendCeilingInUsd?: number;
  databasePath?: string;
  dashboardDirectory?: string;
  gmailPollingIntervalInMilliseconds?: number;
  triage?: {
    propose: (message: ReportedMessage & { accountEmail: string }, examples?: unknown[]) => Promise<unknown>;
  };
}

const systemClock: Clock = { now: () => new Date() };

const pollingIntervalsInMilliseconds = {
  mail: 60 * 1000,
  calendar: 5 * 60 * 1000,
};

const businessTimeZone = 'America/Mexico_City';

function businessDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: businessTimeZone, dateStyle: 'short' }).format(instant);
}

function spentOnBusinessDateInUsd(spends: { spentAt: string; costInUsd: number }[], instant: Date): number {
  const day = businessDate(instant);
  return spends
    .filter(({ spentAt }) => businessDate(new Date(spentAt)) === day)
    .reduce((total, { costInUsd }) => total + costInUsd, 0);
}

function gmailMessageLink({ accountEmail, messageId }: Proposal): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${messageId}`;
}

function proposalEffects(proposal: Proposal, verdicts: { messageId: string }[]) {
  const verdict = verdicts.find((candidate) => candidate.messageId === proposal.messageId);
  return triageEffects(proposal as Parameters<typeof triageEffects>[0], verdict as Parameters<typeof triageEffects>[1]);
}

function confirmedTasks(proposals: Proposal[], verdicts: { messageId: string }[]) {
  return proposals.flatMap((proposal) => {
    const effects = proposalEffects(proposal, verdicts);
    return effects.tasks.map(({ title, accountEmail }) => ({ title, link: gmailMessageLink(proposal), accountEmail }));
  });
}

function confirmedCheckLater(proposals: Proposal[], verdicts: { messageId: string }[]) {
  return proposals.flatMap((proposal) => {
    const effects = proposalEffects(proposal, verdicts);
    return (effects.checkLater ?? []).map(({ company, accountEmail }) => ({
      company,
      link: gmailMessageLink(proposal),
      accountEmail,
    }));
  });
}

function splitActionFromGroups(proposals: Proposal[], verdicts: { messageId: string }[]) {
  const { groups } = triageQueue(proposals, verdicts);
  const withLink = (proposal: Proposal) => ({ ...proposal, link: gmailMessageLink(proposal) });
  const inActionBlock = (category: string | undefined) => category === 'action' || category === 'unknown';
  const describeGroup = ({ category, proposals: grouped, systems }: (typeof groups)[number]) => ({
    category,
    count: grouped.length,
    items: grouped.map(withLink),
    ...(systems && {
      systems: systems.map(({ system, proposals: inSystem }) => ({ system, items: inSystem.map(withLink) })),
    }),
  });
  return {
    action: groups
      .filter(({ category }) => inActionBlock(category))
      .flatMap((group) => group.proposals)
      .map(withLink),
    groups: groups.filter(({ category }) => !inActionBlock(category)).map(describeGroup),
  };
}

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
  const configuredPollingIntervalsInMilliseconds = {
    ...pollingIntervalsInMilliseconds,
    mail: options.gmailPollingIntervalInMilliseconds ?? pollingIntervalsInMilliseconds.mail,
  };
  const databasePath = options.databasePath ?? ':memory:';
  const snapshotStore = openCalendarSnapshotStore(databasePath);
  const reportedMessageStore = openReportedMessageStore(databasePath);
  const mailSourceStore = openMailSourceStore(databasePath);
  const proposalStore = openProposalStore(databasePath);
  const spendStore = openSpendStore(databasePath);
  const verdictStore = openVerdictStore(databasePath);
  const reportedMessages: ReportedMessage[] = [];
  const accountEmailByMessageId = new Map<string, string>();
  const proposals: Proposal[] = proposalStore.loadAll().map(({ messageId, proposal }) => ({
    ...(proposal as Proposal),
    messageId,
    accountEmail: reportedMessageStore.accountEmailOf(messageId),
  }));
  let spentInUsd = spentOnBusinessDateInUsd(spendStore.loadAll(), clock.now());
  const hasReachedDailySpendCeiling = (): boolean =>
    options.dailySpendCeilingInUsd !== undefined && spentInUsd >= options.dailySpendCeilingInUsd;
  const isAllowed = (email: string): boolean => options.allowedEmails.includes(email);
  // An account outside the allow-list is refused before its payload is checked against the contract.
  const refusalStatus = (accountEmail: string, matchesContract: () => boolean): 403 | 400 | undefined => {
    if (!isAllowed(accountEmail)) {
      return 403;
    }
    return matchesContract() ? undefined : 400;
  };
  const verdictExampleLimit = 8;
  const verdictExamplesFor = (message: ReportedMessage) =>
    verdictStore
      .loadAll()
      .map((verdict) => ({
        ...verdict,
        from: reportedMessages.find((reported) => reported.id === verdict.messageId)?.from,
        category: proposals.find((proposal) => proposal.messageId === verdict.messageId)?.category,
      }))
      .filter((verdict) => verdict.from === message.from)
      .sort((first, second) => Date.parse(second.decidedAt) - Date.parse(first.decidedAt))
      .slice(0, verdictExampleLimit);
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
    const report = await context.req.json<{ accountEmail: string; messages: ReportedMessage[] }>();
    const refusal = refusalStatus(report.accountEmail, () => mailReport.safeParse(report).success);
    if (refusal !== undefined) {
      return context.body(null, refusal);
    }
    report.messages.forEach((message) => reportedMessageStore.save(message.id, report.accountEmail));
    reportedMessages.push(...report.messages);
    report.messages.forEach((message) => accountEmailByMessageId.set(message.id, report.accountEmail));
    mailSourceStore.save(report.accountEmail, clock.now());
    return context.body(null, 200);
  });
  app.post('/triage-run', async (context) => {
    for (const message of triageQueue(proposals, [], reportedMessages).remaining) {
      if (hasReachedDailySpendCeiling()) {
        break;
      }
      const accountEmail = accountEmailByMessageId.get(message.id) ?? '';
      const examples = verdictExamplesFor(message);
      const result = (await options.triage?.propose({ ...message, accountEmail }, examples)) as
        TriageResult | undefined;
      const costInUsd = result?.costInUsd ?? 0;
      const answeredAt = clock.now().toISOString();
      spentInUsd += costInUsd;
      spendStore.save({ spentAt: answeredAt, model: result?.model ?? '', costInUsd });
      proposalStore.save({
        messageId: message.id,
        madeAt: answeredAt,
        promptVersion: result?.promptVersion ?? '',
        proposal: result?.proposal,
      });
      proposals.push({
        action: '',
        category: '',
        ...(result?.proposal as Proposal | undefined),
        messageId: message.id,
        accountEmail,
      });
    }
    return context.body(null, 200);
  });
  app.post('/verdicts', async (context) => {
    const { messageId, decision, correction } = await context.req.json<{
      messageId: string;
      decision: string;
      correction?: unknown;
    }>();
    if (!proposals.some((proposal) => proposal.messageId === messageId)) {
      return context.body(null, 404);
    }
    verdictStore.save({ messageId, decision, correction, decidedAt: clock.now().toISOString() });
    return context.body(null, 200);
  });
  app.post('/group-verdicts', async (context) => {
    const { category, decision } = await context.req.json<{ category: string; decision: string }>();
    proposals
      .filter((proposal) => proposal.category === category)
      .forEach(({ messageId }) => verdictStore.save({ messageId, decision, decidedAt: clock.now().toISOString() }));
    return context.body(null, 200);
  });
  app.get('/triage-queue', (context) => {
    return context.json({
      ...splitActionFromGroups(proposals, verdictStore.loadAll()),
      remaining: reportedMessageStore.count() - proposals.length,
      paused: hasReachedDailySpendCeiling(),
    });
  });
  const acknowledgementStore = openAcknowledgementStore(databasePath);
  app.post('/commands/:id/acknowledgement', (context) => {
    acknowledgementStore.save(context.req.param('id'));
    return context.body(null, 200);
  });
  app.get('/commands', (context) => {
    const accountEmail = context.req.query('accountEmail');
    const verdicts = verdictStore.loadAll();
    const acknowledgedCommandIds = acknowledgementStore.loadAll();
    const commands = proposals
      .filter((proposal) => proposal.accountEmail === accountEmail)
      .filter((proposal) => proposal.action === 'archive')
      .filter((proposal) => verdicts.some((verdict) => verdict.messageId === proposal.messageId))
      .map(({ messageId }) => ({ id: `archive-${messageId}`, messageId }))
      .filter((command) => !acknowledgedCommandIds.includes(command.id));
    return context.json({ commands });
  });
  app.get('/tasks', (context) => {
    return context.json({ tasks: confirmedTasks(proposals, verdictStore.loadAll()) });
  });
  app.get('/check-later', (context) => {
    return context.json({ checkLater: confirmedCheckLater(proposals, verdictStore.loadAll()) });
  });
  app.get('/now', (context) => {
    const stored = snapshotStore.loadAll();
    const latestSnapshots = stored.map((entry) => entry.snapshot);
    const events = mergeCalendarSnapshots(latestSnapshots);
    return context.json({
      ...buildNowView(events, clock, businessTimeZone),
      accounts: describeAccountFreshness(stored, clock),
      badgeCount: badgeCount(events, clock, proposals, verdictStore.loadAll()),
      sources: describeSourceFreshness(mailSourceStore.loadAll(), configuredPollingIntervalsInMilliseconds, clock),
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
