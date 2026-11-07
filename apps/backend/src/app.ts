import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Hono } from 'hono';

import { calendarSnapshot, mailReport, triageCategories, type HealthResponse } from '@my-life/contracts';
import {
  badgeCount,
  buildNowView,
  chooseVerdictExamples,
  currentVerdict,
  describeSourceFreshness,
  filterCandidates,
  isAccountFresh,
  isAddressedToUser,
  isLeadingCategory,
  isTriagePaused,
  mergeCalendarSnapshots,
  triageEffects,
  triageQueue,
  type CalendarSnapshot,
  type Clock,
} from '@my-life/domain';

import { openAcknowledgementStore } from './acknowledgement-store';
import { openCategoryModeStore } from './category-mode-store';
import { openCalendarSnapshotStore, type StoredCalendarSnapshot } from './calendar-snapshot-store';
import { openFilterProposalStore } from './filter-proposal-store';
import { openMailSourceStore } from './mail-source-store';
import { openProposalStore } from './proposal-store';
import { openReportedMessageStore } from './reported-message-store';
import { openSpendStore } from './spend-store';
import { defaultGmailPollingIntervalInMilliseconds } from './startup-settings';
import { openVerdictStore, type StoredVerdict } from './verdict-store';

interface ReportedMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  to?: string;
  cc?: string;
  listId?: string;
}

type Proposal = Parameters<typeof triageQueue>[0][number] & { summary?: string; madeAutomatic?: boolean };
type TriageProposal = Parameters<typeof triageEffects>[0];
type TriageVerdict = Parameters<typeof triageEffects>[1];

function withDisplayedCategory(
  proposal: Proposal,
  message: Pick<ReportedMessage, 'to'>,
  accountEmail: string,
): Proposal {
  const isAddressedToAccount = isAddressedToUser({ to: message.to ?? '' }, accountEmail);
  return proposal.category === 'action' && !isAddressedToAccount ? { ...proposal, category: 'cc-thread' } : proposal;
}

// What the Triage port answers for one message: the adapter always reports the cost and the prompt version; the
// scripted fake may omit the model.
interface TriageResult {
  costInUsd: number;
  model?: string;
  proposal?: unknown;
  promptVersion: string;
}

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  dailySpendCeilingInUsd?: number;
  databasePath?: string;
  dashboardDirectory?: string;
  gmailPollingIntervalInMilliseconds?: number;
  triage?: {
    propose: (message: ReportedMessage & { accountEmail: string }, examples?: unknown[]) => Promise<TriageResult>;
  };
  filter?: {
    propose: (candidate: FilterCandidate) => Promise<{ proposal: unknown; costInUsd: number; promptVersion: string }>;
  };
}

type FilterCandidate = ReturnType<typeof filterCandidates>[number];
type DecidedProposal = Parameters<typeof filterCandidates>[0][number];

const systemClock: Clock = { now: () => new Date() };

const pollingIntervalsInMilliseconds = {
  mail: defaultGmailPollingIntervalInMilliseconds,
  calendar: 5 * 60 * 1000,
};

const businessTimeZone = 'America/Mexico_City';

function gmailMessageLink({ accountEmail, messageId }: Proposal): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${messageId}`;
}

// The latest verdict by decision time decides every effect (the domain rule), never the first or last stored row.
function latestVerdictFor<V extends { messageId: string; decidedAt: string }>(
  messageId: string,
  verdicts: V[],
): V | undefined {
  const own = verdicts.filter((verdict) => verdict.messageId === messageId);
  return own.length === 0 ? undefined : currentVerdict(own);
}

function isStillConfirmed(messageId: string, verdicts: StoredVerdict[]): boolean {
  const latestVerdict = latestVerdictFor(messageId, verdicts);
  return latestVerdict !== undefined && latestVerdict.decision !== 'rejected';
}

function isCleared(proposal: Proposal, verdicts: StoredVerdict[]): boolean {
  const latestVerdict = latestVerdictFor(proposal.messageId, verdicts);
  if (latestVerdict === undefined) return proposal.madeAutomatic === true;
  return latestVerdict.decision !== 'rejected';
}

function proposalEffects(proposal: Proposal, verdicts: StoredVerdict[]) {
  const verdict = latestVerdictFor(proposal.messageId, verdicts);
  return triageEffects(proposal as TriageProposal, verdict as TriageVerdict);
}

function confirmedTasks(proposals: Proposal[], verdicts: StoredVerdict[]) {
  return proposals.flatMap((proposal) => {
    const effects =
      proposal.madeAutomatic === true
        ? triageEffects(proposal as TriageProposal, { decision: 'confirmed' })
        : proposalEffects(proposal, verdicts);
    return effects.tasks.map(({ title, accountEmail }) => ({ title, link: gmailMessageLink(proposal), accountEmail }));
  });
}

function confirmedCheckLater(proposals: Proposal[], verdicts: StoredVerdict[]) {
  return proposals.flatMap((proposal) => {
    const effects = proposalEffects(proposal, verdicts);
    return (effects.checkLater ?? []).map(({ company, accountEmail }) => ({
      company,
      link: gmailMessageLink(proposal),
      accountEmail,
    }));
  });
}

function agreementRate(category: string, proposals: Proposal[], verdicts: StoredVerdict[]): number | undefined {
  const categoryProposals = proposals.filter((proposal) => proposal.category === category);
  if (categoryProposals.length === 0) return undefined;
  const confirmedCount = categoryProposals.filter(({ messageId }) => isStillConfirmed(messageId, verdicts)).length;
  return confirmedCount / categoryProposals.length;
}

const recentProposalCount = 5;

function recentProposals(category: string, proposals: Proposal[]) {
  return proposals
    .filter((proposal) => proposal.category === category)
    .slice(-recentProposalCount)
    .reverse()
    .map((proposal) => ({
      summary: proposal.summary,
      action: proposal.action,
      accountEmail: proposal.accountEmail,
      link: gmailMessageLink(proposal),
    }));
}

function awaitingTheUser(proposals: Proposal[]): Proposal[] {
  return proposals.filter((proposal) => proposal.madeAutomatic !== true);
}

function splitActionFromGroups(proposals: Proposal[], verdicts: { messageId: string }[]) {
  const { groups } = triageQueue(awaitingTheUser(proposals), verdicts);
  const withLink = (proposal: Proposal) => ({ ...proposal, link: gmailMessageLink(proposal) });
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
      .filter(({ category }) => isLeadingCategory(category))
      .flatMap((group) => group.proposals)
      .map(withLink),
    groups: groups.filter(({ category }) => !isLeadingCategory(category)).map(describeGroup),
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
  const filterProposalStore = openFilterProposalStore(databasePath);
  const proposedCandidateKeys = new Set<string>();
  const loadDecidedMessages = () => {
    const verdicts = verdictStore.loadAll();
    return reportedMessageStore.loadAll().flatMap(({ messageId, accountEmail, from, listId }) => {
      const verdict = latestVerdictFor(messageId, verdicts);
      const action = proposals.find((proposal) => proposal.messageId === messageId)?.action ?? '';
      return verdict === undefined
        ? []
        : [
            {
              messageId,
              accountEmail,
              from,
              ...(listId === null ? {} : { listId }),
              action,
              verdict: verdict as DecidedProposal['verdict'],
            },
          ];
    });
  };
  const proposeNewFilterCandidates = async (): Promise<void> => {
    const filter = options.filter;
    if (filter === undefined) return;
    for (const candidate of filterCandidates(loadDecidedMessages())) {
      const key = JSON.stringify([candidate.accountEmail, candidate.criteria]);
      if (proposedCandidateKeys.has(key)) continue;
      proposedCandidateKeys.add(key);
      const result = await filter.propose(candidate);
      filterProposalStore.save({
        accountEmail: candidate.accountEmail,
        messageIds: candidate.messageIds,
        promptVersion: result.promptVersion,
        proposedAt: clock.now().toISOString(),
        proposal: result.proposal,
      });
    }
  };
  const reportedMessages: ReportedMessage[] = [];
  const accountEmailByMessageId = new Map<string, string>();
  const automaticMessageIds = new Set(proposalStore.loadAutomaticMessageIds());
  const proposals: Proposal[] = proposalStore.loadAll().map(({ messageId, proposal }) => {
    const accountEmail = reportedMessageStore.accountEmailOf(messageId);
    return {
      ...withDisplayedCategory(
        { ...(proposal as Proposal), messageId, accountEmail },
        reportedMessageStore.recipientsOf(messageId),
        accountEmail,
      ),
      madeAutomatic: automaticMessageIds.has(messageId),
    };
  });
  const loggedSpends = (): { loggedAt: string; costInUsd: number }[] =>
    spendStore.loadAll().map(({ spentAt, costInUsd }) => ({ loggedAt: spentAt, costInUsd }));
  const hasReachedDailySpendCeiling = (): boolean =>
    options.dailySpendCeilingInUsd !== undefined &&
    isTriagePaused(
      loggedSpends(),
      { dailyCeilingInUsd: options.dailySpendCeilingInUsd, timeZone: businessTimeZone },
      clock,
    );
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
    chooseVerdictExamples(
      message,
      verdictStore.loadAll().map((verdict) => {
        const verdictMessage = reportedMessages.find((reported) => reported.id === verdict.messageId);
        return {
          ...verdict,
          from: verdictMessage?.from ?? '',
          listId: verdictMessage?.listId,
          category: proposals.find((proposal) => proposal.messageId === verdict.messageId)?.category ?? '',
        };
      }),
      verdictExampleLimit,
    );
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
    report.messages.forEach((message) => {
      reportedMessageStore.save(message.id, report.accountEmail, message);
    });
    reportedMessages.push(...report.messages);
    report.messages.forEach((message) => accountEmailByMessageId.set(message.id, report.accountEmail));
    mailSourceStore.save(report.accountEmail, clock.now());
    return context.body(null, 200);
  });
  app.post('/triage-run', async (context) => {
    const triage = options.triage;
    if (triage === undefined) {
      return context.body(null, 200);
    }
    for (const message of triageQueue(proposals, [], reportedMessages).remaining) {
      if (hasReachedDailySpendCeiling()) {
        break;
      }
      const accountEmail = accountEmailByMessageId.get(message.id) ?? '';
      const examples = verdictExamplesFor(message);
      const result = await triage.propose({ ...message, accountEmail }, examples);
      const costInUsd = result.costInUsd;
      const answeredAt = clock.now().toISOString();
      spendStore.save({ spentAt: answeredAt, model: result.model ?? '', costInUsd });
      const proposal: Proposal = {
        action: '',
        category: '',
        ...(result.proposal as Proposal | undefined),
        messageId: message.id,
        accountEmail,
      };
      const displayedProposal = withDisplayedCategory(proposal, message, accountEmail);
      const madeAutomatic = categoryModeStore.loadAll()[displayedProposal.category ?? ''] === 'automatic';
      proposalStore.save({
        messageId: message.id,
        madeAt: answeredAt,
        promptVersion: result.promptVersion,
        proposal: result.proposal,
        madeAutomatic,
      });
      proposals.push({ ...displayedProposal, madeAutomatic });
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
    await proposeNewFilterCandidates();
    return context.body(null, 200);
  });
  app.post('/group-verdicts', async (context) => {
    const { category, decision } = await context.req.json<{ category: string; decision: string }>();
    proposals
      .filter((proposal) => proposal.category === category)
      .forEach(({ messageId }) => {
        verdictStore.save({ messageId, decision, decidedAt: clock.now().toISOString() });
      });
    return context.body(null, 200);
  });
  app.get('/triage-queue', (context) => {
    return context.json({
      ...splitActionFromGroups(proposals, verdictStore.loadAll()),
      remaining: reportedMessageStore.count() - proposals.length,
      paused: hasReachedDailySpendCeiling(),
      fetchedAt: clock.now().toISOString(),
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
      .filter((proposal) => isCleared(proposal, verdicts))
      .map(({ messageId, madeAutomatic }) => ({
        id: `archive-${messageId}`,
        messageId,
        label: madeAutomatic ? 'my-life/auto' : 'my-life/archived',
      }))
      .filter((command) => !acknowledgedCommandIds.includes(command.id));
    return context.json({ commands });
  });
  app.get('/tasks', (context) => {
    return context.json({ tasks: confirmedTasks(proposals, verdictStore.loadAll()) });
  });
  const categoryModeStore = openCategoryModeStore(databasePath);
  app.put('/categories/:category/mode', async (context) => {
    const { mode } = await context.req.json<{ mode: string }>();
    const category = context.req.param('category');
    const isKnownCategory = (triageCategories as readonly string[]).includes(category);
    const isKnownMode = ['advise', 'automatic'].includes(mode);
    if (!isKnownCategory || !isKnownMode) {
      return context.body(null, 400);
    }
    categoryModeStore.save(category, mode);
    return context.body(null, 200);
  });
  app.post('/categories/kill-switch', (context) => {
    for (const category of triageCategories) {
      categoryModeStore.save(category, 'advise');
    }
    return context.body(null, 200);
  });
  app.get('/categories', (context) => {
    const categoryModes = categoryModeStore.loadAll();
    const verdicts = verdictStore.loadAll();
    return context.json({
      categories: triageCategories.map((category) => ({
        category,
        mode: categoryModes[category] ?? 'advise',
        agreementRate: agreementRate(category, proposals, verdicts),
        recentProposals: recentProposals(category, proposals),
      })),
    });
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
      badgeCount: badgeCount(events, clock, awaitingTheUser(proposals), verdictStore.loadAll()),
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
