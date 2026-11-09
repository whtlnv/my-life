import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Hono, type MiddlewareHandler } from 'hono';

import {
  calendarSnapshot,
  contactDetails,
  contactsImport,
  type ContactsImport,
  mailReport,
  triageCategories,
  type HealthResponse,
} from '@my-life/contracts';
import {
  badgeCount,
  buildNowView,
  chooseVerdictExamples,
  contactUrgency,
  currentVerdict,
  describeSourceFreshness,
  digests,
  displayedCategory,
  expenseStatement,
  filterCandidates,
  isAccountFresh,
  isDigestedCategory,
  isLeadingCategory,
  isTriagePaused,
  mergeCalendarSnapshots,
  triageEffects,
  triageQueue,
  type CalendarSnapshot,
  type Clock,
  type ExpenseProposal,
} from '@my-life/domain';

import { openAcknowledgementStore } from './acknowledgement-store';
import { profileFileName } from './claude-triage';
import { openCreatedFilterStore } from './created-filter-store';
import { openCategoryModeStore } from './category-mode-store';
import { openContactDetailsStore, type ContactDetails, type ImportedContactRecord } from './contact-details-store';
import { openCalendarSnapshotStore, type StoredCalendarSnapshot } from './calendar-snapshot-store';
import { openFilterDeletionRequestStore } from './filter-deletion-request-store';
import { openFilterProposalApprovalStore } from './filter-proposal-approval-store';
import { openFilterProposalRejectionStore } from './filter-proposal-rejection-store';
import { openUndoAutomaticStore } from './undo-automatic-store';
import { openFilterProposalStore } from './filter-proposal-store';
import { openDigestSummaryStore } from './digest-summary-store';
import { openListedDigestStore } from './listed-digest-store';
import { openMailSourceStore } from './mail-source-store';
import { openProposalStore } from './proposal-store';
import { openReportedMessageStore, type ReportedMessageHeaders } from './reported-message-store';
import { openSpendStore } from './spend-store';
import { defaultGmailPollingIntervalInMilliseconds } from './startup-settings';
import { openVerdictStore, type StoredVerdict } from './verdict-store';

interface BodiesReport {
  accountEmail: string;
  bodies: { messageId: string; body: string }[];
}

interface ReportedMessage extends ReportedMessageHeaders {
  id: string;
}

type Proposal = Parameters<typeof triageQueue>[0][number] & {
  summary?: string;
  madeAutomatic?: boolean;
  madeAt?: string;
  organization?: string;
  people?: { name: string; email?: string }[];
  dates?: string[];
  asks?: { ask: string }[];
  threadState?: string;
  disagreement?: { firstCategory: string; secondCategory: string };
};
type TriageProposal = Parameters<typeof triageEffects>[0];
type TriageVerdict = Parameters<typeof triageEffects>[1];

function withDisplayedCategory(
  proposal: Proposal,
  message: Pick<ReportedMessage, 'to'>,
  accountEmail: string,
): Proposal {
  if (proposal.category === undefined) return proposal;
  return { ...proposal, category: displayedCategory({ category: proposal.category }, message, accountEmail) };
}

// What the Triage port answers for one message: the adapter always reports the cost and the prompt version; the
// scripted fake may omit the model.
interface TriageResult {
  costInUsd: number;
  model?: string;
  proposal?: unknown;
  promptVersion: string;
}

// What the triage port learns about the sender: the display name from the From header plus the record the user and
// the contacts import keep on that email.
type TriageContact = { displayName: string; marks: string[] } & ContactDetails;
// What the triage port receives for one message: the report, the account it arrived on, the sender's record and the
// thread state an earlier message's extraction left behind.
type TriageRequest = ReportedMessage & {
  accountEmail: string;
  contact?: TriageContact | undefined;
  threadState?: string | undefined;
};

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  dailySpendCeilingInUsd?: number;
  databasePath?: string;
  dashboardDirectory?: string;
  profileDirectory?: string;
  gmailPollingIntervalInMilliseconds?: number;
  urgency?: { unansweredAskBusinessDays: number };
  triage?: {
    propose: (message: TriageRequest, examples?: unknown[]) => Promise<TriageResult>;
  };
  filter?: {
    propose: (
      candidate: FilterCandidate & { messages: { from: string; subject: string }[] },
    ) => Promise<{ proposal: unknown; costInUsd: number; promptVersion: string }>;
  };
  summary?: {
    summarize: (request: {
      items: { summary: string }[];
    }) => Promise<{ lines: string[]; costInUsd: number; model?: string }>;
  };
}

type FilterCandidate = ReturnType<typeof filterCandidates>[number];
type DecidedProposal = Parameters<typeof filterCandidates>[0][number];

function categoryQuestionChoices(
  category: Proposal['category'],
  disagreement: Proposal['disagreement'],
): string[] | undefined {
  if (disagreement !== undefined) {
    return [disagreement.firstCategory, disagreement.secondCategory];
  }
  if (category === 'unknown') {
    return triageCategories.filter((knownCategory) => knownCategory !== 'unknown');
  }
  return undefined;
}

const systemClock: Clock = { now: () => new Date() };

const pollingIntervalsInMilliseconds = {
  mail: defaultGmailPollingIntervalInMilliseconds,
  calendar: 5 * 60 * 1000,
};

const businessTimeZone = 'America/Mexico_City';

// The label an automatic archive puts on a message and its undo takes off again.
const automaticLabelName = 'my-life/auto';

// main.ts loads `prompts/<version>.md`, and the Claude adapter reports the file's name as the proposal's version.
export const currentTriagePromptVersion = 'triage-v2';

function gmailMessageLink({ accountEmail, messageId }: Pick<Proposal, 'accountEmail' | 'messageId'>): string {
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

const csvField = (value: string | number): string => {
  const text = String(value);
  return /[",]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function agreementRate(category: string, proposals: Proposal[], verdicts: StoredVerdict[]): number | undefined {
  const categoryProposals = proposals.filter((proposal) => proposal.category === category);
  if (categoryProposals.length === 0) return undefined;
  const confirmedCount = categoryProposals.filter(({ messageId }) => isStillConfirmed(messageId, verdicts)).length;
  return confirmedCount / categoryProposals.length;
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const businessDateOf = (instant: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: businessTimeZone, dateStyle: 'short' }).format(instant);

const mondayOfBusinessWeek = (instant: Date): string => {
  const today = businessDateOf(instant);
  const midnight = Date.parse(`${today}T00:00:00.000Z`);
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * millisecondsPerDay).toISOString().slice(0, 10);
};

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

function withLink(proposal: Proposal) {
  return { ...proposal, link: gmailMessageLink(proposal) };
}

function describeHandledForYou(proposals: Proposal[], clock: Clock) {
  const today = businessDateOf(clock.now());
  return proposals
    .filter((proposal) => proposal.madeAutomatic === true)
    .filter((proposal) => proposal.madeAt !== undefined && businessDateOf(new Date(proposal.madeAt)) === today)
    .map(withLink);
}

function splitActionFromGroups(proposals: Proposal[], verdicts: { messageId: string }[]) {
  const { groups } = triageQueue(awaitingTheUser(proposals), verdicts);
  const describeGroup = ({ category, proposals: grouped }: (typeof groups)[number]) => ({
    category,
    count: grouped.length,
    items: grouped.map(withLink),
  });
  return {
    action: groups
      .filter(({ category }) => isLeadingCategory(category))
      .flatMap((group) => group.proposals)
      .map(withLink),
    groups: groups
      .filter(({ category }) => !isLeadingCategory(category) && !isDigestedCategory(category))
      .map(describeGroup),
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

function createFilterCommandId(filterProposalId: string): string {
  return `create-filter-${filterProposalId}`;
}

function deleteFilterCommandId(gmailFilterId: string): string {
  return `delete-filter-${gmailFilterId}`;
}

interface ListedContact {
  displayName: string;
  emails: string[];
  messageIds: string[];
}

type ImportedContact = ContactsImport['contacts'][number];

function newestFirst(first: { date: string }, second: { date: string }): number {
  return new Date(second.date).getTime() - new Date(first.date).getTime();
}

function sharePrimaryEmail(left: { emails: string[] }, right: { emails: string[] }): boolean {
  return left.emails[0] === right.emails[0];
}

function withUnlistedImportedContacts<Contact extends ListedContact>(
  messageContacts: Contact[],
  importedContacts: ListedContact[],
): (Contact | ListedContact)[] {
  const unlistedImportedContacts = importedContacts.filter(
    (imported) => !messageContacts.some((contact) => sharePrimaryEmail(contact, imported)),
  );
  return [...messageContacts, ...unlistedImportedContacts];
}

// A second import of an email the list already holds merges its addresses into that contact instead of adding one.
function listImportedContacts(imports: ImportedContactRecord[]): ListedContact[] {
  return imports.reduce<ListedContact[]>((importedContacts, imported) => {
    const alreadyImported = importedContacts.find((listed) => sharePrimaryEmail(listed, imported));
    if (alreadyImported) {
      alreadyImported.emails = [...new Set([...alreadyImported.emails, ...imported.emails])];
    } else {
      importedContacts.push({ displayName: imported.displayName, emails: imported.emails, messageIds: [] });
    }
    return importedContacts;
  }, []);
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
  const filterProposalRejectionStore = openFilterProposalRejectionStore(databasePath);
  const filterProposalApprovalStore = openFilterProposalApprovalStore(databasePath);
  const acknowledgementStore = openAcknowledgementStore(databasePath);
  const createdFilterStore = openCreatedFilterStore(databasePath);
  const filterDeletionRequestStore = openFilterDeletionRequestStore(databasePath);
  const categoryModeStore = openCategoryModeStore(databasePath);
  const contactDetailsStore = openContactDetailsStore(databasePath);
  const digestSummaryStore = openDigestSummaryStore(databasePath);
  // The messages each digest held when GET /triage-queue last listed it: a confirm reaches only those.
  const listedDigestStore = openListedDigestStore(databasePath);
  const undoAutomaticStore = openUndoAutomaticStore(databasePath);
  // Messages reported before this process started are reloaded, so a restart never strands a message untriaged.
  const storedMessages = reportedMessageStore.loadReportedMessages();
  const reportedMessages: ReportedMessage[] = storedMessages;
  const accountEmailByMessageId = new Map<string, string>(
    storedMessages.map((message) => [message.id, message.accountEmail]),
  );
  const automaticMessageIds = new Set(proposalStore.loadAutomaticMessageIds());
  // Overlapping runs once stored a proposal twice (append-only); the latest row per message is the one that counts.
  const latestStoredProposals = [
    ...new Map(proposalStore.loadAll().map((stored) => [stored.messageId, stored])).values(),
  ];
  const proposals: Proposal[] = latestStoredProposals.map(({ messageId, madeAt, proposal }) => {
    const accountEmail = reportedMessageStore.accountEmailOf(messageId);
    return {
      ...withDisplayedCategory(
        { ...(proposal as Proposal), messageId, accountEmail },
        reportedMessageStore.recipientsOf(messageId),
        accountEmail,
      ),
      madeAutomatic: automaticMessageIds.has(messageId),
      madeAt,
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
  const proposedCandidateKeys = new Set<string>(filterProposalStore.loadCandidateKeys());
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
  const describeMessages = (messageIds: string[], decidedMessages: ReturnType<typeof loadDecidedMessages>) =>
    messageIds.map((messageId) => ({
      from: decidedMessages.find((message) => message.messageId === messageId)?.from ?? '',
      subject: reportedMessageStore.subjectOf(messageId),
    }));
  const proposeNewFilterCandidates = async (): Promise<void> => {
    const filter = options.filter;
    if (filter === undefined) return;
    if (hasReachedDailySpendCeiling()) return;
    const decidedMessages = loadDecidedMessages();
    for (const candidate of filterCandidates(decidedMessages)) {
      const key = JSON.stringify([candidate.accountEmail, candidate.criteria]);
      if (proposedCandidateKeys.has(key)) continue;
      proposedCandidateKeys.add(key);
      const result = await filter.propose({
        ...candidate,
        messages: describeMessages(candidate.messageIds, decidedMessages),
      });
      spendStore.save({ spentAt: clock.now().toISOString(), model: '', costInUsd: result.costInUsd });
      filterProposalStore.save(
        {
          accountEmail: candidate.accountEmail,
          messageIds: candidate.messageIds,
          promptVersion: result.promptVersion,
          proposedAt: clock.now().toISOString(),
          proposal: result.proposal,
        },
        key,
      );
    }
  };
  const isAllowed = (email: string): boolean => options.allowedEmails.includes(email);
  // An account outside the allow-list is refused before its payload is checked against the contract.
  const refusalStatus = (accountEmail: string, matchesContract: () => boolean): 403 | 400 | undefined => {
    if (!isAllowed(accountEmail)) {
      return 403;
    }
    return matchesContract() ? undefined : 400;
  };
  const verdictExampleLimit = 8;
  // A category the user chose in answer to a question outranks the one the model proposed.
  const categoryOfVerdict = (verdict: { messageId: string; correction?: unknown }): string =>
    (verdict.correction as { category?: string } | undefined)?.category ??
    proposals.find((proposal) => proposal.messageId === verdict.messageId)?.category ??
    '';
  const verdictExamplesFor = (message: ReportedMessage) =>
    chooseVerdictExamples(
      message,
      verdictStore.loadAll().map((verdict) => {
        const verdictMessage = reportedMessages.find((reported) => reported.id === verdict.messageId);
        return {
          ...verdict,
          from: verdictMessage?.from ?? '',
          listId: verdictMessage?.listId,
          category: categoryOfVerdict(verdict),
        };
      }),
      verdictExampleLimit,
    );
  let triageRunInProgress = false;
  let verdictGivenSinceLastRun = false;
  // A message proposed before its body arrived is asked about once more, this time with the body.
  const messagesWithBodyProposedUnderAnOlderPrompt = reportedMessages.filter(
    (message) => message.body !== undefined && wasProposedUnderAnOlderPrompt(message.id),
  );
  const messageIdsAwaitingRetriage = new Set<string>(
    messagesWithBodyProposedUnderAnOlderPrompt.map((message) => message.id),
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
  app.get('/bodies-missing', (context) => {
    const accountEmail = context.req.query('account');
    const messageIds = reportedMessageStore
      .loadReportedMessages()
      .filter((message) => message.accountEmail === accountEmail && message.body === undefined)
      .map((message) => message.id);
    return context.json({ messageIds });
  });
  app.post('/bodies-report', async (context) => {
    const report = await context.req.json<BodiesReport>();
    report.bodies.forEach(({ messageId, body }) => {
      reportedMessageStore.saveBody(messageId, body);
      const reportedMessage = reportedMessages.find((message) => message.id === messageId);
      if (reportedMessage !== undefined) reportedMessage.body = body;
      if (wasProposedUnderAnOlderPrompt(messageId)) messageIdsAwaitingRetriage.add(messageId);
    });
    return context.body(null, 200);
  });
  // A message already proposed under the current prompt gains nothing from a retriage when its body arrives.
  function wasProposedUnderAnOlderPrompt(messageId: string): boolean {
    const latestStoredProposal = latestProposalFor(proposalStore.loadAll(), messageId);
    return latestStoredProposal !== undefined && latestStoredProposal.promptVersion !== currentTriagePromptVersion;
  }
  // A retriage replaces the message's open proposal; a proposal the user has already decided on is left alone.
  function queueProposal(queuedProposal: Proposal): void {
    const existingIndex = proposals.findIndex((proposal) => proposal.messageId === queuedProposal.messageId);
    if (existingIndex === -1) {
      proposals.push(queuedProposal);
      return;
    }
    const userHasAlreadyDecided = latestVerdictFor(queuedProposal.messageId, verdictStore.loadAll()) !== undefined;
    if (userHasAlreadyDecided) {
      return;
    }
    proposals[existingIndex] = queuedProposal;
  }
  function triageContactFor(from: string): TriageContact | undefined {
    const sender = contactFromSender(from);
    const details = contactDetailsStore.loadAll()[sender.email];
    const marked = contactDetailsStore.markedEmails().has(sender.email);
    if (details === undefined && !marked) {
      return undefined;
    }
    return {
      displayName: sender.displayName,
      marks: marked ? ['vip'] : [],
      ...details,
    };
  }
  function isEarlierInSameThread(other: ReportedMessage, message: ReportedMessage): boolean {
    return (
      other.threadId === message.threadId &&
      other.id !== message.id &&
      new Date(other.date).getTime() <= new Date(message.date).getTime()
    );
  }
  // A reply is read with the thread state the earlier message's extraction left behind.
  function threadStateFor(message: ReportedMessage): string | undefined {
    const earlierMessage = reportedMessages.find((other) => isEarlierInSameThread(other, message));
    if (earlierMessage === undefined) {
      return undefined;
    }
    const storedProposal = latestProposalFor(proposalStore.loadAll(), earlierMessage.id);
    return (storedProposal?.proposal as { threadState?: string } | undefined)?.threadState;
  }
  function triageRequestFor(message: ReportedMessage, accountEmail: string): TriageRequest {
    return {
      ...message,
      accountEmail,
      contact: triageContactFor(message.from),
      threadState: threadStateFor(message),
    };
  }
  app.post('/triage-run', async (context) => {
    const triage = options.triage;
    if (triage === undefined) {
      return context.body(null, 200);
    }
    // One run at a time: a run that outlives the 30-second schedule must not be joined by a second one proposing the
    // same remaining messages again (each proposal is a paid Claude call).
    if (triageRunInProgress) {
      return context.body(null, 409);
    }
    triageRunInProgress = true;
    try {
      const awaitingRetriage = reportedMessages.filter((message) => messageIdsAwaitingRetriage.has(message.id));
      let proposedInThisRun = false;
      const messagesToTriage = [...triageQueue(proposals, [], reportedMessages).remaining, ...awaitingRetriage].filter(
        (message) => message.sentByUser !== true,
      );
      for (const message of messagesToTriage) {
        if (hasReachedDailySpendCeiling()) {
          break;
        }
        const accountEmail = accountEmailByMessageId.get(message.id) ?? '';
        const examples = verdictExamplesFor(message);
        const result = await triage.propose(triageRequestFor(message, accountEmail), examples);
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
        messageIdsAwaitingRetriage.delete(message.id);
        queueProposal({ ...displayedProposal, madeAutomatic, madeAt: answeredAt });
        proposedInThisRun = true;
      }
      if (proposedInThisRun || verdictGivenSinceLastRun) {
        verdictGivenSinceLastRun = false;
        await rewriteDigestSummaryLines();
      }
    } finally {
      triageRunInProgress = false;
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
    verdictGivenSinceLastRun = true;
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
  async function rewriteDigestSummaryLines() {
    for (const digest of waitingDigests(verdictStore.loadAll())) {
      const items = digest.proposals.map(({ messageId }) => ({
        summary: latestProposalFor(proposals, messageId)?.summary ?? '',
      }));
      const summary = await summarizeWithinTheSpendCeiling(items);
      digestSummaryStore.save(identifyDigest(digest), summary?.lines);
    }
  }
  // Summarizes one digest and logs its spend; writes nothing once the daily ceiling is reached.
  async function summarizeWithinTheSpendCeiling(items: { summary: string }[]) {
    if (hasReachedDailySpendCeiling()) return undefined;
    const summary = await options.summary?.summarize({ items }).catch(() => undefined);
    if (summary)
      spendStore.save({ spentAt: clock.now().toISOString(), model: summary.model ?? '', costInUsd: summary.costInUsd });
    return summary;
  }
  // The waiting proposals outside the action block, with the sender each digest groups by.
  function waitingOutsideTheActionBlock(verdicts: StoredVerdict[]) {
    return triageQueue(awaitingTheUser(proposals), verdicts)
      .groups.filter(({ category }) => !isLeadingCategory(category))
      .flatMap((group) => group.proposals)
      .map((proposal) => ({
        ...proposal,
        category: proposal.category ?? '',
        extract: proposal.extract ?? {},
        from: reportedMessages.find((message) => message.id === proposal.messageId)?.from ?? '',
      }));
  }
  // Every digest of the waiting proposals: GET /triage-queue lists, the triage run summarizes and a confirm reaches
  // the same digests, so their ids agree.
  function waitingDigests(verdicts: StoredVerdict[]) {
    return digests(waitingOutsideTheActionBlock(verdicts));
  }
  // A digest's id: its account, category, key and first message, so a digest opened after a confirm is a fresh one.
  function identifyDigest({
    key,
    proposals: digested,
  }: {
    key: string | undefined;
    proposals: readonly ReturnType<typeof waitingOutsideTheActionBlock>[number][];
  }): string {
    const { accountEmail, category, messageId } = digested[0] ?? {};
    return JSON.stringify([accountEmail, category, key, messageId]);
  }
  function recordAndDescribeListedDigests(verdicts: StoredVerdict[]) {
    return waitingDigests(verdicts).map((digest) => {
      const { key, proposals: digested, severityCounts, significantItems } = digest;
      const { accountEmail, category } = digested[0] ?? {};
      const id = identifyDigest(digest);
      listedDigestStore.save(
        id,
        digested.map(({ messageId }) => messageId),
      );
      return {
        id,
        accountEmail,
        category,
        key,
        count: digested.length,
        severityCounts,
        summaryLines: digestSummaryStore.load(id),
        significantItems: significantItems.map((item) => ({
          messageId: item.messageId,
          summary: proposals.find(({ messageId }) => messageId === item.messageId)?.summary,
          accountEmail: item.accountEmail,
          link: gmailMessageLink(item),
        })),
      };
    });
  }
  app.post('/digests/:id/confirmation', (context) => {
    const digestId = context.req.param('id');
    const listedMessageIds = listedDigestStore.load(digestId);
    if (!listedMessageIds) return context.body(null, 404);
    waitingDigests(verdictStore.loadAll())
      .filter((digest) => identifyDigest(digest) === digestId)
      .flatMap(({ proposals: digested }) => digested)
      .filter(({ messageId }) => listedMessageIds.includes(messageId))
      .forEach(({ messageId }) => {
        verdictStore.save({ messageId, decision: 'confirmed', decidedAt: clock.now().toISOString() });
      });
    return context.body(null, 200);
  });
  app.get('/triage-queue', (context) => {
    const verdicts = verdictStore.loadAll();
    const undoneMessageIds = undoAutomaticStore.loadAll();
    return context.json({
      ...splitActionFromGroups(proposals, verdicts),
      digests: recordAndDescribeListedDigests(verdicts),
      handledForYou: describeHandledForYou(proposals, clock).filter(
        ({ messageId }) => !undoneMessageIds.includes(messageId),
      ),
      remaining:
        reportedMessageStore.count() -
        proposals.length -
        reportedMessages.filter((message) => message.sentByUser === true).length,
      paused: hasReachedDailySpendCeiling(),
      fetchedAt: clock.now().toISOString(),
    });
  });
  app.get('/needs-input', (context) => {
    const verdicts = verdictStore.loadAll();
    const categoryQuestions = proposals.flatMap(({ messageId, accountEmail, category, disagreement }) => {
      const alreadyAnswered = latestVerdictFor(messageId, verdicts) !== undefined;
      const choices = categoryQuestionChoices(category, disagreement);
      if (alreadyAnswered || choices === undefined) return [];
      return [{ kind: 'category', messageId, accountEmail, choices }];
    });
    const newSenderQuestions = proposals.flatMap(({ messageId, accountEmail, asks }) => {
      const message = reportedMessages.find((reported) => reported.id === messageId);
      const asksTheUser = asks !== undefined && asks.length > 0;
      if (!asksTheUser || message === undefined) return [];
      const senderEmail = contactFromSender(message.from).email;
      const senderWroteBefore = reportedMessages.some(
        (reported) => reported.id !== messageId && contactFromSender(reported.from).email === senderEmail,
      );
      const senderAlreadyMarked = contactDetailsStore.markedEmails().has(senderEmail);
      if (senderWroteBefore || senderAlreadyMarked) return [];
      return [{ kind: 'new-sender', senderEmail, messageId, accountEmail, choices: ['vip', 'ordinary'] }];
    });
    return context.json({ questions: [...categoryQuestions, ...newSenderQuestions] });
  });
  app.post('/needs-input/answers', async (context) => {
    const { kind, senderEmail, messageId, answer } = await context.req.json<{
      kind?: string;
      senderEmail: string;
      messageId: string;
      answer: string;
    }>();
    if (kind === 'new-sender') {
      contactDetailsStore.saveMark(senderEmail, answer);
      return context.body(null, 200);
    }
    verdictStore.save({
      messageId,
      decision: 'confirmed',
      correction: { category: answer },
      decidedAt: clock.now().toISOString(),
    });
    return context.body(null, 200);
  });
  app.get('/filter-proposals', (context) => {
    const decidedFilterProposalIds = new Set([
      ...filterProposalRejectionStore.loadAll(),
      ...filterProposalApprovalStore.loadApprovedProposalIds(),
    ]);
    return context.json({
      proposals: filterProposalStore
        .loadAll()
        .filter((stored) => !decidedFilterProposalIds.has(stored.id))
        .map((stored) => ({
          ...(stored.proposal as object),
          id: stored.id,
          accountEmail: stored.accountEmail,
          archiveCount: stored.messageIds.length,
        })),
    });
  });
  app.post('/filter-proposals/:id/rejection', (context) => {
    filterProposalRejectionStore.save(context.req.param('id'));
    return context.body(null, 200);
  });
  app.post('/filter-proposals/:id/approval', (context) => {
    filterProposalApprovalStore.save(context.req.param('id'), clock.now().toISOString());
    return context.body(null, 200);
  });
  app.post('/commands/:id/acknowledgement', async (context) => {
    const commandId = context.req.param('id');
    acknowledgementStore.save(commandId);
    const body = await context.req.text();
    if (body !== '') {
      const { gmailFilterId } = JSON.parse(body) as { gmailFilterId: string };
      createdFilterStore.save(commandId, gmailFilterId, clock.now().toISOString());
    }
    return context.body(null, 200);
  });
  // Each filter whose creation was acknowledged, paired with the proposal it was created from.
  const loadCreatedFilters = () => {
    const createdFilters = createdFilterStore.loadAll();
    return filterProposalStore
      .loadAll()
      .flatMap((stored) =>
        createdFilters
          .filter(({ commandId }) => commandId === createFilterCommandId(stored.id))
          .map(({ gmailFilterId, acknowledgedAt }) => ({ stored, gmailFilterId, acknowledgedAt })),
      );
  };
  app.get('/filters', (context) => {
    const approvals = filterProposalApprovalStore.loadAll();
    const acknowledgedCommandIds = acknowledgementStore.loadAll();
    return context.json({
      filters: loadCreatedFilters()
        .filter(({ gmailFilterId }) => !acknowledgedCommandIds.includes(deleteFilterCommandId(gmailFilterId)))
        .map(({ stored, gmailFilterId, acknowledgedAt }) => ({
          ...(stored.proposal as object),
          accountEmail: stored.accountEmail,
          gmailFilterId,
          approvedAt: approvals.find(({ proposalId }) => proposalId === stored.id)?.approvedAt,
          acknowledgedAt,
        })),
    });
  });
  app.delete('/filters/:id', (context) => {
    filterDeletionRequestStore.save(context.req.param('id'), clock.now().toISOString());
    return context.body(null, 200);
  });
  app.post('/handled-for-you/:messageId/undo', (context) => {
    const messageId = context.req.param('messageId');
    const wasHandledForYou = proposals.some((proposal) => proposal.messageId === messageId && proposal.madeAutomatic);
    if (!wasHandledForYou) return context.body(null, 404);
    undoAutomaticStore.save(messageId);
    return context.body(null, 200);
  });
  app.get('/commands', (context) => {
    const accountEmail = context.req.query('accountEmail');
    const verdicts = verdictStore.loadAll();
    const acknowledgedCommandIds = acknowledgementStore.loadAll();
    const approvedFilterProposalIds = filterProposalApprovalStore.loadApprovedProposalIds();
    const archiveCommands = proposals
      .filter((proposal) => proposal.accountEmail === accountEmail)
      .filter((proposal) => proposal.action === 'archive')
      .filter((proposal) => isCleared(proposal, verdicts))
      .map(({ messageId, madeAutomatic }) => ({
        id: `archive-${messageId}`,
        messageId,
        label: madeAutomatic ? automaticLabelName : 'my-life/archived',
      }));
    const filterCommands = filterProposalStore
      .loadAll()
      .filter((stored) => stored.accountEmail === accountEmail && approvedFilterProposalIds.includes(stored.id))
      .map((stored) => ({
        id: createFilterCommandId(stored.id),
        type: 'create-filter',
        ...(stored.proposal as object),
      }));
    const filterDeletionRequests = filterDeletionRequestStore.loadAll();
    const deleteFilterCommands = loadCreatedFilters()
      .filter(({ stored }) => stored.accountEmail === accountEmail)
      .flatMap(({ gmailFilterId }) =>
        filterDeletionRequests
          .filter((request) => request.gmailFilterId === gmailFilterId)
          .map(({ requestedAt }) => ({
            id: deleteFilterCommandId(gmailFilterId),
            type: 'delete-filter',
            gmailFilterId,
            requestedAt,
          })),
      );
    const isMessageOfAccount = (messageId: string) =>
      proposals.some((proposal) => proposal.messageId === messageId && proposal.accountEmail === accountEmail);
    const undoAutomaticCommands = undoAutomaticStore
      .loadAll()
      .filter(isMessageOfAccount)
      .map((messageId) => ({
        id: `undo-automatic-${messageId}`,
        type: 'undo-automatic',
        messageId,
        label: automaticLabelName,
      }));
    const pendingCommands = [
      ...archiveCommands,
      ...filterCommands,
      ...deleteFilterCommands,
      ...undoAutomaticCommands,
    ].filter((command) => !acknowledgedCommandIds.includes(command.id));
    return context.json({ commands: pendingCommands });
  });
  app.get('/tasks', (context) => {
    return context.json({ tasks: confirmedTasks(proposals, verdictStore.loadAll()) });
  });
  const reportedSenders = () => reportedMessageStore.loadAll().map(({ messageId, from }) => ({ messageId, from }));
  const rejectUnknownMark: MiddlewareHandler = async (context, next) => {
    if (context.req.param('mark') !== 'vip') {
      return context.body(null, 400);
    }
    await next();
  };
  const contactMarkRoute = '/contacts/:email/marks/:mark';
  app.put(contactMarkRoute, rejectUnknownMark, (context) => {
    contactDetailsStore.saveMark(context.req.param('email'), context.req.param('mark'));
    return context.body(null, 200);
  });
  app.delete(contactMarkRoute, rejectUnknownMark, (context) => {
    const email = context.req.param('email');
    contactDetailsStore.removeMark(email, context.req.param('mark'));
    return context.body(null, 200);
  });
  app.patch('/contacts/:email', async (context) => {
    const details = await context.req.json<ContactDetails>();
    if (!contactDetails.safeParse(details).success) {
      return context.body(null, 400);
    }
    contactDetailsStore.save(context.req.param('email'), details);
    return context.body(null, 200);
  });
  // A Google contact without an email (phone-only) has no handle to link to yet; it is skipped.
  const importContact = ({ name, emails, organization, starred, lists }: ImportedContact): void => {
    const [primaryEmail] = emails;
    if (primaryEmail === undefined) return;
    contactDetailsStore.saveImportedDetails(primaryEmail, {
      ...(organization === undefined ? {} : { organization }),
      ...(lists ? { lists } : {}),
    });
    const userRemovedVip = contactDetailsStore.userRemovedMark(primaryEmail, 'vip');
    if (starred && !userRemovedVip) {
      contactDetailsStore.saveMark(primaryEmail, 'vip');
    }
    contactDetailsStore.saveImported({ displayName: name ?? primaryEmail, emails });
  };
  app.post('/contacts-import', async (context) => {
    const parsed = contactsImport.safeParse(await context.req.json());
    if (!parsed.success) {
      return context.body(null, 400);
    }
    parsed.data.contacts.forEach(importContact);
    return context.body(null, 200);
  });
  app.get('/contacts', (context) => {
    const detailsByEmail = contactDetailsStore.loadAll();
    const markedEmails = contactDetailsStore.markedEmails();
    const contacts = withUnlistedImportedContacts(
      contactsByEmail(reportedSenders(), proposals),
      listImportedContacts(contactDetailsStore.loadImported()),
    );
    return context.json({
      contacts: contacts.map((contact) => {
        const primaryEmail = contact.emails[0] ?? '';
        return {
          ...contact,
          marks: markedEmails.has(primaryEmail) ? ['vip'] : [],
          ...detailsByEmail[primaryEmail],
        };
      }),
    });
  });
  app.get('/contacts/:email/timeline', (context) => {
    const email = context.req.param('email');
    const namesContact = (messageIdentifier: string): boolean =>
      proposals.some(
        ({ messageId, people = [] }) =>
          messageId === messageIdentifier && people.some((person) => person.email === email),
      );
    const involvesContact = (message: ReportedMessage): boolean =>
      contactFromSender(message.from).email === email || namesContact(message.id);
    const contactThreadIds = new Set(reportedMessages.filter(involvesContact).map((message) => message.threadId));
    const isUserReplyInContactThread = (message: ReportedMessage): boolean =>
      message.sentByUser === true && contactThreadIds.has(message.threadId);
    const isLaterUserReplyTo = (message: ReportedMessage, other: ReportedMessage): boolean =>
      other.sentByUser === true &&
      other.threadId === message.threadId &&
      new Date(other.date).getTime() > new Date(message.date).getTime();
    const messages = reportedMessages
      .filter((message) => involvesContact(message) || isUserReplyInContactThread(message))
      .toSorted(newestFirst)
      .map((message) => {
        const accountEmail = accountEmailByMessageId.get(message.id) ?? '';
        const proposal = proposals.find((candidate) => candidate.messageId === message.id);
        const userRepliedLater = reportedMessages.some((other) => isLaterUserReplyTo(message, other));
        return {
          id: message.id,
          subject: message.subject,
          accountEmail,
          link: gmailMessageLink({ accountEmail, messageId: message.id }),
          sentByUser: message.sentByUser === true,
          threadState: proposal?.threadState,
          asks: (proposal?.asks ?? []).map((ask) => ({ ...ask, status: userRepliedLater ? 'answered' : 'open' })),
        };
      });
    return context.json({ messages });
  });
  app.get('/people', (context) => {
    const markedEmails = contactDetailsStore.markedEmails();
    const contacts = contactsByEmail(reportedSenders(), proposals);
    const alwaysMattersLineOfAccount = (accountEmail: string) => {
      const profilePath = join(options.profileDirectory ?? '', profileFileName(accountEmail));
      return existsSync(profilePath) ? alwaysMattersLine(readFileSync(profilePath, 'utf8')) : '';
    };
    const isOnAlwaysMattersLine = (contact: { emails: string[]; messageIds: string[] }) =>
      options.profileDirectory !== undefined &&
      contact.messageIds.some((messageId) =>
        alwaysMattersLineOfAccount(accountEmailByMessageId.get(messageId) ?? '').includes(contact.emails[0] ?? ''),
      );
    const isVip = (contact: { emails: string[]; messageIds: string[] }) => {
      const primaryEmail = contact.emails[0] ?? '';
      return (
        markedEmails.has(primaryEmail) ||
        (isOnAlwaysMattersLine(contact) && !contactDetailsStore.userRemovedMark(primaryEmail, 'vip'))
      );
    };
    const conversationMessagesOf = (contact: { messageIds: string[] }) =>
      reportedMessages
        .filter((message) => contact.messageIds.includes(message.id) || message.sentByUser === true)
        .map((message) => {
          const proposal = proposals.find((candidate) => candidate.messageId === message.id);
          return {
            threadId: message.threadId,
            receivedAt: new Date(message.date).toISOString(),
            sentByUser: message.sentByUser === true,
            dates: proposal?.dates ?? [],
            asks: proposal?.asks ?? [],
          };
        });
    const urgencySettings = {
      timeZone: businessTimeZone,
      unansweredAskBusinessDays: options.urgency?.unansweredAskBusinessDays ?? 2,
      deadlineHours: 48,
      vipWaitingBusinessDays: 1,
    };
    const urgencyOf = (contact: { emails: string[]; messageIds: string[] }) =>
      contactUrgency({
        messages: conversationMessagesOf(contact),
        vip: isVip(contact),
        now: clock.now().toISOString(),
        settings: urgencySettings,
      });
    const urgentContacts = contacts.flatMap((contact) => {
      const { urgent, reasons } = urgencyOf(contact);
      return urgent ? [{ ...contact, reasons }] : [];
    });
    const isUrgent = (contact: { emails: string[] }) =>
      urgentContacts.some((urgentContact) => urgentContact.emails[0] === contact.emails[0]);
    const mostRecentMessageTime = (contact: { messageIds: string[] }) =>
      Math.max(
        ...reportedMessages
          .filter((message) => contact.messageIds.includes(message.id))
          .map((message) => new Date(message.date).getTime()),
      );
    return context.json({
      urgent: urgentContacts,
      vip: contacts.filter(isVip),
      everyoneElse: contacts
        .filter((contact) => !isVip(contact) && !isUrgent(contact))
        .sort((first, second) => mostRecentMessageTime(second) - mostRecentMessageTime(first)),
    });
  });
  app.get('/organizations', (context) => {
    return context.json({ organizations: organizationsByName(reportedSenders(), proposals) });
  });
  app.get('/organizations/:name/timeline', (context) => {
    const name = context.req.param('name');
    const messageIds =
      organizationsByName(reportedSenders(), proposals).find((organization) => organization.name === name)
        ?.messageIds ?? [];
    const messages = reportedMessages
      .filter((message) => messageIds.includes(message.id))
      .toSorted(newestFirst)
      .map((message) => ({
        id: message.id,
        subject: message.subject,
        accountEmail: accountEmailByMessageId.get(message.id) ?? '',
      }));
    return context.json({ messages });
  });
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
  app.get('/expense-statement', (context) => {
    const verdicts = verdictStore.loadAll();
    const expenseProposals = proposals.map((proposal) => ({
      ...(proposal as unknown as ExpenseProposal),
      date: reportedMessageStore.dateOf(proposal.messageId),
      link: gmailMessageLink(proposal),
      verdict: latestVerdictFor(proposal.messageId, verdicts),
    }));
    const entries = expenseStatement(expenseProposals, {
      week: context.req.query('week') ?? mondayOfBusinessWeek(clock.now()),
      timeZone: businessTimeZone,
    });
    const rows = entries.map(({ vendor, amount, currency, date, accountEmail, link }) =>
      [vendor, amount, currency, date, accountEmail, link].map(csvField).join(','),
    );
    return context.body(['vendor,amount,currency,date,account,link', ...rows, ''].join('\n'), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="expense-statement.csv"',
    });
  });
  app.get('/check-later', (context) => {
    return context.json({ checkLater: confirmedCheckLater(proposals, verdictStore.loadAll()) });
  });
  app.get('/search', (context) => {
    const query = context.req.query('q') ?? '';
    return context.json({ messages: messagesWhoseBodyOrSummaryContainsWord(reportedMessages, proposals, query) });
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

const quotedOrBareDisplayNameThenAngleBracketedEmail = /^"?(.*?)"? <(.*)>$/;

const freeMailDomains = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com']);

function messagesWhoseBodyOrSummaryContainsWord(
  messages: ReportedMessage[],
  proposals: Proposal[],
  word: string,
): ReportedMessage[] {
  const containsWord = (text: string | undefined): boolean => text?.split(/\W+/).includes(word) ?? false;
  return messages.filter(
    (message) => containsWord(message.body) || containsWord(latestProposalFor(proposals, message.id)?.summary),
  );
}

function latestProposalFor<T extends { messageId: string }>(proposals: T[], messageId: string): T | undefined {
  return proposals.findLast((proposal) => proposal.messageId === messageId);
}

// One organization per name: each reported message lists under the organization its latest proposal names, or
// under its sender's domain when no proposal names one.
function organizationsByName(senders: { messageId: string; from: string }[], proposals: Proposal[]) {
  const messageIdsByName = new Map<string, string[]>();
  for (const { messageId, from } of senders) {
    const organization = latestProposalFor(proposals, messageId)?.organization;
    const name = organization ?? senderDomain(from);
    if (freeMailDomains.has(name)) continue;
    messageIdsByName.set(name, [...(messageIdsByName.get(name) ?? []), messageId]);
  }
  return [...messageIdsByName].map(([name, messageIds]) => ({ name, messageIds }));
}

function senderDomain(from: string): string {
  const { email } = contactFromSender(from);
  return email.slice(email.indexOf('@') + 1);
}

// One contact per email: a message's sender and every person its extraction names with an email, each listing the
// messages they sent or appear in. The sender's own display name wins over a name the extraction gives.
function alwaysMattersLine(profile: string): string {
  return profile.split('\n').find((line) => line.startsWith('- Always matters:')) ?? '';
}

function contactsByEmail(senders: { messageId: string; from: string }[], proposals: Proposal[]) {
  const contacts = new Map<string, ListedContact>();
  const link = (email: string, displayName: string, messageId: string) => {
    const contact = contacts.get(email) ?? { displayName, emails: [email], messageIds: [] };
    if (!contact.messageIds.includes(messageId)) contact.messageIds.push(messageId);
    contacts.set(email, contact);
  };
  for (const { messageId, from } of senders) {
    const { displayName, email } = contactFromSender(from);
    link(email, displayName, messageId);
  }
  for (const { people = [], messageId } of proposals) {
    for (const { name, email } of people) {
      if (email !== undefined) link(email, name, messageId);
    }
  }
  return [...contacts.values()].map((contact) => ({ ...contact, messageIds: contact.messageIds.toSorted() }));
}

function contactFromSender(from: string) {
  const match = quotedOrBareDisplayNameThenAngleBracketedEmail.exec(from);
  if (match === null) {
    return { displayName: from, email: from };
  }
  const [, displayName, email] = match as unknown as [string, string, string];
  return { displayName, email };
}
