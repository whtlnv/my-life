import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Hono, type MiddlewareHandler } from 'hono';

import {
  calendarSnapshot,
  contactDetails,
  contactsImport,
  type ContactsImport,
  mailReport,
  taskRanks,
  type TaskRanks,
  triageCategories,
  type HealthResponse,
  whatsappReport,
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
  localCalendarDate,
  mergeCalendarSnapshots,
  triageEffects,
  taskProposals,
  openTasks,
  taskHistory,
  triageQueue,
  decideAgentAction,
  type CalendarSnapshot,
  type Clock,
  type ExpenseProposal,
} from '@my-life/domain';

import { openAcknowledgementStore } from './acknowledgement-store';
import { profileFileName, readOptionalFile } from './claude-triage';
import { type ChatMessage, type ChatMessageVerdict, openChatMessageStore } from './chat-message-store';
import { openCreatedFilterStore } from './created-filter-store';
import { openCategoryModeStore } from './category-mode-store';
import { openContactDetailsStore, type ContactDetails, type ImportedContactRecord } from './contact-details-store';
import { openCalendarSnapshotStore, type StoredCalendarSnapshot } from './calendar-snapshot-store';
import { openFilterDeletionRequestStore } from './filter-deletion-request-store';
import { openFilterProposalApprovalStore } from './filter-proposal-approval-store';
import { openFilterProposalRejectionStore } from './filter-proposal-rejection-store';
import { openPrioritizationStore } from './prioritization-store';
import { openUndoAutomaticStore } from './undo-automatic-store';
import { openFilterProposalStore } from './filter-proposal-store';
import { openAgentActionStore, type StoredAgentAction } from './agent-action-store';
import { type ConversationTurn, openConversationStore } from './conversation-store';
import { openDigestSummaryStore } from './digest-summary-store';
import { openListedDigestStore } from './listed-digest-store';
import { openMailSourceStore } from './mail-source-store';
import { openProposalStore } from './proposal-store';
import { openReportedMessageStore, type ReportedMessageHeaders } from './reported-message-store';
import { openSlackMessageStore, type SlackMessage, type SlackVerdict } from './slack-message-store';
import { pollSlackWorkspaces } from './slack-poll';
import { openSlackSendStore } from './slack-send-store';
import { openSlackWorkspacePollStore } from './slack-workspace-poll-store';
import { openSpendStore } from './spend-store';
import { startTelegram, type TelegramStartClient } from './start-telegram';
import { openTaskEventStore } from './task-event-store';
import {
  businessTimeZone,
  defaultDeadlineHours,
  defaultGmailPollingIntervalInMilliseconds,
  defaultUnansweredAskBusinessDays,
  defaultVipWaitingBusinessDays,
} from './startup-settings';
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
  asks?: { ask: string; due?: string }[];
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

interface TelegramAppClient extends Partial<TelegramStartClient> {
  sendText: (chatId: string, text: string) => Promise<{ messageId: string }>;
  getOwnAccount?: () => Promise<{ id: string; name: string }>;
  isConnected?: () => boolean;
}

export interface AppOptions {
  allowedEmails: string[];
  clock?: Clock;
  dailySpendCeilingInUsd?: number;
  databasePath?: string;
  prioritizationIntervalInMilliseconds?: number;
  dashboardDirectory?: string;
  profileDirectory?: string;
  gmailPollingIntervalInMilliseconds?: number;
  slackApiUrl?: string;
  slackWorkspaces?: { teamId: string; userToken: string }[];
  telegramClient?: TelegramAppClient;
  slackPollingIntervalInMilliseconds?: number;
  // How many days a first Slack poll reads back for a conversation with nothing stored (default 7).
  slackFirstPollLookbackDays?: number;
  urgency?: { unansweredAskBusinessDays: number };
  triage?: {
    propose: (message: TriageRequest, examples?: unknown[]) => Promise<TriageResult>;
  };
  filter?: {
    propose: (
      candidate: FilterCandidate & { messages: { from: string; subject: string }[] },
    ) => Promise<{ proposal: unknown; costInUsd: number; promptVersion: string }>;
  };
  prioritization?: {
    prioritize: (context: {
      tasks: { id: string; title: string; accountEmail: string; due: string | undefined }[];
      profile: string;
      calendar: ReturnType<typeof mergeCalendarSnapshots>;
      urgentContacts: unknown[];
    }) => Promise<{ ranks?: TaskRanks['ranks']; costInUsd?: number; model?: string }>;
  };
  agent?: {
    respond: (request: {
      turns: ConversationTurn[];
      tools?: AgentTool[];
    }) => Promise<{ text: string | undefined; citations?: { id: string }[]; costInUsd: number; model?: string }>;
  };
  summary?: {
    summarize: (request: {
      items: { summary: string }[];
    }) => Promise<{ lines: string[]; costInUsd: number; model?: string }>;
  };
}

interface AgentToolInputSchema {
  type: 'object';
  properties: Record<string, { type: 'string' }>;
  required: string[];
}

interface AgentTool {
  name: string;
  description: string;
  inputSchema: AgentToolInputSchema;
  run: (input: unknown) => Promise<unknown>;
}

function stringInputs(...required: string[]): AgentToolInputSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(required.map((name) => [name, { type: 'string' as const }])),
    required,
  };
}

function countMatchingWords(text: string | undefined, query: string): number {
  if (text === undefined) return 0;
  const textWords = text.split(/\W+/);
  return query.split(/\W+/).filter((word) => textWords.includes(word)).length;
}

type FilterCandidate = ReturnType<typeof filterCandidates>[number];
type DecidedProposal = Parameters<typeof filterCandidates>[0][number];
type SlackMessageReference = Pick<SlackMessage, 'workspaceTeamId' | 'conversationId' | 'timestamp'>;

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

// The label an automatic archive puts on a message and its undo takes off again.
const automaticLabelName = 'my-life/auto';
const archivedLabelName = 'my-life/archived';

// main.ts loads `prompts/<version>.md`, and the Claude adapter reports the file's name as the proposal's version.
export const currentTriagePromptVersion = 'triage-v2';
export const agentUnavailableReply = 'The agent is unavailable: no Anthropic key is configured.';
export const agentSpendCeilingReply = 'The agent is paused: the daily spend ceiling is reached.';

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

const mondayOfBusinessWeek = (instant: Date): string => {
  const today = localCalendarDate(instant, businessTimeZone);
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
  const today = localCalendarDate(clock.now(), businessTimeZone);
  return proposals
    .filter((proposal) => proposal.madeAutomatic === true)
    .filter(
      (proposal) => proposal.madeAt !== undefined && localCalendarDate(proposal.madeAt, businessTimeZone) === today,
    )
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

function isLaterUserReplyTo(message: ReportedMessage, other: ReportedMessage): boolean {
  return (
    other.sentByUser === true &&
    other.threadId === message.threadId &&
    new Date(other.date).getTime() > new Date(message.date).getTime()
  );
}

function primaryEmailOf(contact: { emails: string[] }): string {
  return contact.emails[0] ?? '';
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

function newestPerSender<Message>(
  messages: Message[],
  senderKeyOf: (message: Message) => string,
  isNewer: (message: Message, than: Message) => boolean,
): Message[] {
  const newestBySender = new Map<string, Message>();
  for (const message of messages) {
    const senderKey = senderKeyOf(message);
    const newest = newestBySender.get(senderKey);
    if (newest === undefined || isNewer(message, newest)) newestBySender.set(senderKey, message);
  }
  return [...newestBySender.values()];
}

function newestMessagePerSender(messages: ChatMessage[]): ChatMessage[] {
  return newestPerSender(
    messages,
    (message) => message.senderId,
    (message, than) => message.time > than.time,
  );
}

function slackSenderContactKey(message: SlackMessage): string {
  return slackContactKey({ workspaceTeamId: message.workspaceTeamId, userId: message.senderUserId });
}

function newestSlackMessagePerSender(messages: SlackMessage[]): SlackMessage[] {
  return newestPerSender(
    messages,
    slackSenderContactKey,
    (message, than) => Number(message.timestamp) > Number(than.timestamp),
  );
}

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const clock = options.clock ?? systemClock;
  const startedAt = clock.now().toISOString();
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
  const prioritizationStore = openPrioritizationStore(databasePath);
  const taskEventStore = openTaskEventStore(databasePath);
  const slackMessageStore = openSlackMessageStore(databasePath);
  const chatMessageStore = openChatMessageStore(databasePath);
  const { listDialogs, onMessage } = options.telegramClient ?? {};
  if (listDialogs !== undefined && onMessage !== undefined) {
    startTelegram({ client: { listDialogs, onMessage }, store: chatMessageStore }).catch((error: unknown) => {
      console.error('telegram start failed', error);
    });
  }
  // Messages reported before this process started are reloaded, so a restart never strands a message untriaged.
  const storedMessages = reportedMessageStore.loadReportedMessages();
  const reportedMessages: ReportedMessage[] = storedMessages;
  const accountEmailByMessageId = new Map<string, string>(
    storedMessages.map((message) => [message.id, message.accountEmail]),
  );
  const accountEmailOfReported = (messageId: string): string => accountEmailByMessageId.get(messageId) ?? '';
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
  const logSpend = (
    { model, costInUsd }: { model?: string | undefined; costInUsd: number },
    spentAt = clock.now().toISOString(),
  ): void => {
    spendStore.save({ spentAt, model: model ?? '', costInUsd });
  };
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
      const action = latestProposalFor(proposals, messageId)?.action ?? '';
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
      logSpend({ costInUsd: result.costInUsd });
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
    latestProposalFor(proposals, verdict.messageId)?.category ??
    '';
  const verdictExamplesFor = (message: ReportedMessage) =>
    chooseVerdictExamples(
      message,
      verdictStore.loadAll().map((verdict) => {
        const verdictMessage = reportedMessageWithId(reportedMessages, verdict.messageId);
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
  app.get('/chat-messages', (context) => context.json({ messages: chatMessageStore.listMessages() }));
  let whatsappStatus:
    | { parserBroken: true; missingSelector: string }
    | { parserBroken: false; lastReportedAt: string }
    | undefined;
  app.post('/chat-messages', async (context) => {
    const body = await context.req.json<{ ok?: boolean; missingSelector: string }>();
    if (body.ok === false) {
      whatsappStatus = { parserBroken: true, missingSelector: body.missingSelector };
      return context.json({ ok: true });
    }
    const parsed = whatsappReport.safeParse(body);
    if (!parsed.success) {
      return context.body(null, 400);
    }
    const report = parsed.data;
    whatsappStatus = { parserBroken: false, lastReportedAt: clock.now().toISOString() };
    for (const message of report.openChat.messages) {
      chatMessageStore.saveMessage({
        channel: report.channel,
        chatId: report.openChat.title,
        chatTitle: report.openChat.title,
        messageId: message.id,
        senderId: message.sender,
        senderName: message.sender,
        text: message.text,
        time: message.sentAt,
        sentByUser: message.sentByUser,
      });
    }
    return context.json({ ok: true });
  });
  app.post('/chat-verdicts', async (context) => {
    const verdict = await context.req.json<ChatMessageVerdict>();
    chatMessageStore.saveVerdict(verdict);
    if (verdict.decision === 'task') {
      const message = chatMessageStore
        .listMessages()
        .find((stored) => stored.chatId === verdict.chatId && stored.messageId === verdict.messageId);
      taskEventStore.save({
        type: 'proposal-confirmed',
        taskId: `chat-${verdict.channel}-${verdict.chatId}-${verdict.messageId}`,
        at: clock.now().toISOString(),
        proposal: {
          title: String(message?.text),
          accountEmail: verdict.channel,
          link: telegramChatLink(verdict.chatId),
        },
      });
    }
    return context.json({ ok: true });
  });
  app.post('/chat-sends', async (context) => {
    const send = await context.req.json<{ channel: string; chatId: string; text: string }>();
    const telegramClient = options.telegramClient;
    if (send.text === '' || send.channel !== 'telegram' || telegramClient === undefined) {
      return context.body(null, 400);
    }
    let sent;
    try {
      sent = await telegramClient.sendText(send.chatId, send.text);
    } catch (error) {
      return context.json({ error: (error as Error).message }, 502);
    }
    const ownAccount = await telegramClient.getOwnAccount?.();
    const chatTitle = chatMessageStore.listMessages().find((message) => message.chatId === send.chatId)?.chatTitle;
    chatMessageStore.saveMessage({
      channel: send.channel,
      chatId: send.chatId,
      chatTitle: chatTitle ?? '',
      messageId: sent.messageId,
      senderId: ownAccount?.id ?? '',
      senderName: ownAccount?.name ?? '',
      text: send.text,
      time: clock.now().toISOString(),
      sentByUser: true,
    });
    return context.json({ ok: true });
  });
  app.get('/slack-messages', (context) => context.json({ messages: slackMessageStore.listMessages() }));
  app.get('/slack-contacts/:workspaceTeamId/:userId/timeline', (context) => {
    const { workspaceTeamId, userId } = context.req.param();
    const messages = slackMessageStore
      .listMessages()
      .filter((message) => message.workspaceTeamId === workspaceTeamId && message.senderUserId === userId)
      .sort((first, second) => Number(second.timestamp) - Number(first.timestamp))
      .map((message) => ({
        ...message,
        workspaceName: slackWorkspacePollFor(message.workspaceTeamId)?.name,
        permalink: slackMessagePermalink(message),
      }));
    return context.json({ messages });
  });
  app.get('/telegram-contacts/:userId/timeline', (context) => {
    const { userId } = context.req.param();
    const messages = chatMessageStore
      .listMessages()
      .filter((message) => message.senderId === userId)
      .sort((first, second) => second.time.localeCompare(first.time))
      .map((message) => ({ ...message, link: telegramChatLink(message.chatId) }));
    return context.json({ messages });
  });
  const configuredSlackWorkspaces = options.slackWorkspaces ?? [];
  const slackApiUrl = options.slackApiUrl ?? '';
  const fetchSlack = (path: string, userToken: string, jsonBody?: unknown) => {
    const authorization = { Authorization: `Bearer ${userToken}` };
    return fetch(
      `${slackApiUrl}${path}`,
      jsonBody === undefined
        ? { headers: authorization }
        : {
            method: 'POST',
            headers: { ...authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonBody),
          },
    );
  };
  interface SlackWorkspacePoll {
    teamId: string;
    name?: string;
    url?: string | undefined;
    lastSuccessfulPollAt?: string;
    lastPollFailure?: string | undefined;
  }
  const slackWorkspacePollStore = openSlackWorkspacePollStore<SlackWorkspacePoll[]>(databasePath);
  let slackWorkspacePolls: SlackWorkspacePoll[] | undefined = slackWorkspacePollStore.loadLatest();
  const slackWorkspacePollFor = (workspaceTeamId: string) =>
    slackWorkspacePolls?.find(({ teamId }) => teamId === workspaceTeamId);
  const describeSlackWorkspaceFreshness = (poll: SlackWorkspacePoll) => {
    const pollingIntervalInMilliseconds = options.slackPollingIntervalInMilliseconds;
    if (pollingIntervalInMilliseconds === undefined || poll.lastSuccessfulPollAt === undefined) {
      return poll;
    }
    const lastReportedAt = poll.lastSuccessfulPollAt;
    return {
      ...poll,
      stale: !isAccountFresh({ email: poll.teamId, lastReportedAt, pollingIntervalInMilliseconds }, clock),
    };
  };
  const telegramConnectionCheckIntervalInMilliseconds = 60_000;
  let telegramLastSeenConnectedAt = startedAt;
  const describeTelegramConnection = () => {
    if (options.telegramClient === undefined) {
      return { loggedIn: false };
    }
    if (options.telegramClient.isConnected?.() === false) {
      const telegramFreshness = {
        email: 'telegram',
        lastReportedAt: telegramLastSeenConnectedAt,
        pollingIntervalInMilliseconds: telegramConnectionCheckIntervalInMilliseconds,
      };
      if (!isAccountFresh(telegramFreshness, clock)) {
        return { loggedIn: true, lastStartedAt: startedAt, stale: true };
      }
    } else {
      telegramLastSeenConnectedAt = clock.now().toISOString();
    }
    const lastReceivedTelegramMessage = chatMessageStore
      .listMessages()
      .filter((message) => message.channel === 'telegram' && !message.sentByUser)
      .at(-1);
    return lastReceivedTelegramMessage === undefined
      ? { loggedIn: true, lastStartedAt: startedAt }
      : { loggedIn: true, lastMessageAt: lastReceivedTelegramMessage.time };
  };
  const fetchSlackWorkspaceIdentity = async (userToken: string): Promise<{ name: string; url: string | undefined }> => {
    const slackResponse = await fetchSlack('/auth.test', userToken);
    const { team, url } = (await slackResponse.json()) as { team: string; url?: string };
    return { name: team, url };
  };
  const slackDisplayNamesByUserId = new Map<string, string>();
  app.post('/slack-poll', async (context) => {
    const pollFailuresByTeamId = new Map<string, string>();
    const succeededTeamIds = await pollSlackWorkspaces({
      fetch,
      apiUrl: slackApiUrl,
      workspaces: configuredSlackWorkspaces,
      store: slackMessageStore,
      clock,
      displayNamesByUserId: slackDisplayNamesByUserId,
      ...(options.slackFirstPollLookbackDays === undefined
        ? {}
        : { firstPollLookbackDays: options.slackFirstPollLookbackDays }),
      logPollFailure: (teamId, error) => {
        console.error(`Slack poll failed for workspace ${teamId}:`, error);
        pollFailuresByTeamId.set(teamId, String(error));
      },
    });
    slackWorkspacePolls = await Promise.all(
      configuredSlackWorkspaces.map(async ({ teamId, userToken }) =>
        succeededTeamIds.has(teamId)
          ? {
              teamId,
              ...(await fetchSlackWorkspaceIdentity(userToken)),
              lastSuccessfulPollAt: clock.now().toISOString(),
            }
          : { teamId, lastPollFailure: pollFailuresByTeamId.get(teamId) },
      ),
    );
    slackWorkspacePollStore.save(slackWorkspacePolls);
    return context.json({});
  });
  interface SlackSendRequest {
    workspaceTeamId: string;
    conversationId: string;
    threadTimestamp?: string;
    text: string;
  }
  const slackSendStore = openSlackSendStore<SlackSendRequest & { sentAt: string }>(databasePath);
  interface SlackPostMessageResult {
    ok: boolean;
    error?: string;
    channel: string;
    ts: string;
  }
  const slackUserTokenFor = (workspaceTeamId: string): string =>
    configuredSlackWorkspaces.find(({ teamId }) => teamId === workspaceTeamId)?.userToken ?? '';
  const postSlackMessage = async (send: SlackSendRequest): Promise<SlackPostMessageResult> => {
    const slackResponse = await fetchSlack('/chat.postMessage', slackUserTokenFor(send.workspaceTeamId), {
      channel: send.conversationId,
      thread_ts: send.threadTimestamp,
      text: send.text,
    });
    return (await slackResponse.json()) as SlackPostMessageResult;
  };
  const fetchOwnSlackUserId = async (workspaceTeamId: string): Promise<string> => {
    const slackResponse = await fetchSlack('/auth.test', slackUserTokenFor(workspaceTeamId));
    const { user_id: ownSlackUserId } = (await slackResponse.json()) as { user_id: string };
    return ownSlackUserId;
  };
  const recordSlackSend = async (send: SlackSendRequest, slackResult: SlackPostMessageResult): Promise<void> => {
    slackSendStore.save({ ...send, sentAt: clock.now().toISOString() });
    slackMessageStore.saveMessage({
      workspaceTeamId: send.workspaceTeamId,
      conversationId: slackResult.channel,
      senderUserId: await fetchOwnSlackUserId(send.workspaceTeamId),
      text: send.text,
      timestamp: slackResult.ts,
      sentByUser: true,
    });
  };
  const isSendableToSlack = (send: SlackSendRequest): boolean =>
    send.text !== '' && slackUserTokenFor(send.workspaceTeamId) !== '';
  app.post('/slack-sends', async (context) => {
    const send = await context.req.json<SlackSendRequest>();
    if (!isSendableToSlack(send)) {
      return context.body(null, 400);
    }
    const slackResult = await postSlackMessage(send);
    if (!slackResult.ok) {
      return context.json({ error: slackResult.error }, 502);
    }
    await recordSlackSend(send, slackResult);
    return context.json({});
  });
  app.get('/slack-sends', (context) => context.json({ sends: slackSendStore.loadAll() }));
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
      const reportedMessage = reportedMessageWithId(reportedMessages, messageId);
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
    await rewriteBotChatDigestSummaryLines();
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
        const accountEmail = accountEmailOfReported(message.id);
        const examples = verdictExamplesFor(message);
        const result = await triage.propose(triageRequestFor(message, accountEmail), examples);
        const answeredAt = clock.now().toISOString();
        logSpend(result, answeredAt);
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
    if (summary) logSpend(summary);
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
        from: reportedMessageWithId(reportedMessages, proposal.messageId)?.from ?? '',
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
          summary: latestProposalFor(proposals, item.messageId)?.summary,
          accountEmail: item.accountEmail,
          link: gmailMessageLink(item),
        })),
      };
    });
  }
  app.post('/digests/:id/confirmation', (context) => {
    const digestId = context.req.param('id');
    const botChatMessages = unconfirmedBotChatDigestMessages(digestId);
    if (botChatMessages) {
      for (const { channel, chatId, messageId } of botChatMessages)
        chatMessageStore.saveVerdict({ channel, chatId, messageId, decision: 'confirmed' });
      digestSummaryStore.save(digestId, undefined);
      return context.body(null, 200);
    }
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
  const slackMessageKey = (message: SlackMessageReference) =>
    `${message.workspaceTeamId}/${message.conversationId}/${message.timestamp}`;
  app.post('/slack-verdicts', async (context) => {
    const verdict = await context.req.json<SlackVerdict>();
    const verdictKey = slackMessageKey(verdict);
    slackMessageStore.saveVerdict(verdict);
    if (verdict.decision === 'act') {
      const message = slackMessageStore.listMessages().find((stored) => slackMessageKey(stored) === verdictKey);
      taskEventStore.save({
        type: 'proposal-confirmed',
        taskId: `slack-${verdictKey}`,
        at: clock.now().toISOString(),
        proposal: {
          title: String(message?.text),
          accountEmail: verdict.workspaceTeamId,
          link: slackMessagePermalink(verdict),
        },
      });
    }
    return context.body(null, 200);
  });
  function slackMessagePermalink(message: SlackMessageReference) {
    const workspaceUrl = slackWorkspacePollFor(message.workspaceTeamId)?.url;
    if (workspaceUrl === undefined) {
      return slackClientLink(message);
    }
    return `${workspaceUrl}archives/${message.conversationId}/p${message.timestamp.replace('.', '')}`;
  }
  function displaySlackMentions(text: string, slackUserNames: Map<string, string | null | undefined>) {
    return text.replace(/<@(\w+)>/g, (_mention, userId: string) => `@${slackUserNames.get(userId) ?? userId}`);
  }
  function slackConversationKey(message: {
    workspaceTeamId: string;
    conversationId: string;
    threadTimestamp?: string;
  }) {
    return `${message.workspaceTeamId}/${message.conversationId}/${message.threadTimestamp ?? ''}`;
  }
  function newestMessagePerSlackConversation<
    Message extends { workspaceTeamId: string; conversationId: string; timestamp: string; threadTimestamp?: string },
  >(messages: Message[]): Message[] {
    const newestByConversation = new Map<string, Message>();
    for (const message of messages) {
      const conversationKey = slackConversationKey(message);
      const newest = newestByConversation.get(conversationKey);
      if (newest === undefined || message.timestamp > newest.timestamp)
        newestByConversation.set(conversationKey, message);
    }
    return [...newestByConversation.values()].toSorted(
      (first, second) => Number(first.timestamp) - Number(second.timestamp),
    );
  }
  function describeSlackItems() {
    const decidedSlackMessageKeys = new Set(slackMessageStore.listVerdicts().map(slackMessageKey));
    const messages = slackMessageStore.listMessages();
    const slackUserNames = new Map(messages.map((message) => [message.senderUserId, message.senderName]));
    return newestMessagePerSlackConversation(messages)
      .filter((message) => !decidedSlackMessageKeys.has(slackMessageKey(message)))
      .filter((message) => message.sentByUser !== true)
      .map((message) => ({
        ...message,
        text: displaySlackMentions(message.text, slackUserNames),
        workspaceName: slackWorkspacePollFor(message.workspaceTeamId)?.name,
        permalink: slackMessagePermalink(message),
        choices: ['ignore', 'act', 'reply'],
      }));
  }
  const chatMessageKey = (message: { chatId: string; messageId: string }) => `${message.chatId}/${message.messageId}`;
  // The messages each bot digest's stored summary covers, so a triage run summarizes a bot chat only when they change.
  const summarizedMessageKeysByBotDigest = new Map<string, string>();
  async function rewriteBotChatDigestSummaryLines() {
    for (const [chatId, messages] of unconfirmedBotMessagesByChat()) {
      const digestId = identifyBotChatDigest(chatId);
      const messageKeys = messages.map(chatMessageKey).join(' ');
      if (summarizedMessageKeysByBotDigest.get(digestId) === messageKeys) continue;
      const summary = await summarizeWithinTheSpendCeiling(messages.map(({ text }) => ({ summary: text })));
      digestSummaryStore.save(digestId, summary?.lines);
      if (summary) summarizedMessageKeysByBotDigest.set(digestId, messageKeys);
    }
  }
  const identifyBotChatDigest = (chatId: string) => JSON.stringify(['bot-chat', chatId]);
  function unconfirmedBotChatDigestMessages(digestId: string) {
    return [...unconfirmedBotMessagesByChat()].find(([chatId]) => identifyBotChatDigest(chatId) === digestId)?.[1];
  }
  function describeBotChatDigests() {
    return [...unconfirmedBotMessagesByChat()].map(([chatId, messages]) => ({
      id: identifyBotChatDigest(chatId),
      title: messages[0]?.chatTitle,
      channel: messages[0]?.channel,
      count: messages.length,
      summaryLines: digestSummaryStore.load(identifyBotChatDigest(chatId)),
    }));
  }
  function unconfirmedBotMessagesByChat() {
    const confirmedMessageKeys = new Set(
      chatMessageStore
        .listVerdicts()
        .filter((verdict) => verdict.decision === 'confirmed')
        .map(chatMessageKey),
    );
    const botMessagesByChat = new Map<string, ChatMessage[]>();
    for (const message of chatMessageStore
      .listMessages()
      .filter((message) => message.chatIsBot && !confirmedMessageKeys.has(chatMessageKey(message))))
      botMessagesByChat.set(message.chatId, [...(botMessagesByChat.get(message.chatId) ?? []), message]);
    return botMessagesByChat;
  }
  function describeChatItems() {
    const newestMessageByChat = new Map(chatMessageStore.listMessages().map((message) => [message.chatId, message]));
    const verdicts = chatMessageStore.listVerdicts();
    const hasVerdict = (message: { chatId: string; messageId: string }) =>
      verdicts.some((verdict) => verdict.chatId === message.chatId && verdict.messageId === message.messageId);
    return [...newestMessageByChat.values()]
      .filter((message) => !message.sentByUser && !message.chatIsBot && !hasVerdict(message))
      .map(({ channel, chatId, messageId, chatTitle, senderName, text, time }) => ({
        channel,
        chatId,
        messageId,
        chatTitle,
        senderName,
        text,
        time,
        link: telegramChatLink(chatId),
      }));
  }
  app.get('/triage-queue', (context) => {
    const verdicts = verdictStore.loadAll();
    const undoneMessageIds = undoAutomaticStore.loadAll();
    return context.json({
      ...splitActionFromGroups(proposals, verdicts),
      digests: [...recordAndDescribeListedDigests(verdicts), ...describeBotChatDigests()],
      slackItems: describeSlackItems(),
      chatItems: describeChatItems(),
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
  const needsInputQuestions = () => {
    const verdicts = verdictStore.loadAll();
    const categoryQuestions = proposals.flatMap(({ messageId, accountEmail, category, disagreement, summary }) => {
      const alreadyAnswered = latestVerdictFor(messageId, verdicts) !== undefined;
      const choices = categoryQuestionChoices(category, disagreement);
      if (alreadyAnswered || choices === undefined) return [];
      const message = reportedMessageWithId(reportedMessages, messageId);
      return [
        { kind: 'category', messageId, accountEmail, choices, subject: message?.subject, summary, from: message?.from },
      ];
    });
    const newSenderQuestions = proposals.flatMap(({ messageId, accountEmail, asks }) => {
      const message = reportedMessageWithId(reportedMessages, messageId);
      const asksTheUser = asks !== undefined && asks.length > 0;
      if (!asksTheUser || message === undefined) return [];
      const { email: senderEmail, displayName: senderName } = contactFromSender(message.from);
      const senderWroteBefore = reportedMessages.some(
        (reported) => reported.id !== messageId && contactFromSender(reported.from).email === senderEmail,
      );
      const senderAlreadyAnswered =
        contactDetailsStore.markedEmails().has(senderEmail) || contactDetailsStore.userRemovedMark(senderEmail, 'vip');
      if (senderWroteBefore || senderAlreadyAnswered) return [];
      return [
        {
          kind: 'new-sender',
          senderEmail,
          messageId,
          accountEmail,
          choices: ['vip', 'ordinary'],
          senderName,
          asks: asks.map(({ ask }) => ask),
        },
      ];
    });
    return [...categoryQuestions, ...newSenderQuestions];
  };
  app.get('/needs-input', (context) => context.json({ questions: needsInputQuestions() }));
  app.post('/needs-input/answers', async (context) => {
    const { kind, senderEmail, messageId, answer } = await context.req.json<{
      kind?: string;
      senderEmail: string;
      messageId: string;
      answer: string;
    }>();
    if (kind === 'new-sender') {
      if (answer === 'vip') contactDetailsStore.saveMark(senderEmail, answer);
      else contactDetailsStore.removeMark(senderEmail, 'vip');
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
  const approveFilterProposal = (proposalId: string): void => {
    filterProposalApprovalStore.save(proposalId, clock.now().toISOString());
  };
  app.post('/filter-proposals/:id/approval', (context) => {
    approveFilterProposal(context.req.param('id'));
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
        label: madeAutomatic ? automaticLabelName : archivedLabelName,
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
    const undoneAgentActions = agentActionStore.loadAll().filter(({ undone }) => undone === true);
    const undoAgentArchiveCommands = undoneAgentActions
      .filter(({ tool, target }) => tool === 'archive_message' && isMessageOfAccount(target))
      .map(({ target: messageId }) => ({
        id: `undo-agent-archive-${messageId}`,
        type: 'undo-automatic',
        messageId,
        label: archivedLabelName,
      }));
    const removeLabelCommands = undoneAgentActions
      .filter(({ tool, target }) => tool === 'label_message' && isMessageOfAccount(target))
      .map(({ target: messageId, labelName }) => ({
        id: `remove-label-${messageId}`,
        type: 'remove-label',
        messageId,
        label: labelName,
      }));
    const labelCommands = agentActionStore
      .loadAll()
      .filter(({ tool, target, outcome }) => tool === 'label_message' && !outcome && isMessageOfAccount(target))
      .map(({ id, target: messageId, labelName }) => ({
        id: `label-${id}`,
        type: 'label',
        messageId,
        label: labelName,
      }));
    const draftCommands = agentActionStore
      .loadAll()
      .filter(({ tool, target, outcome }) => tool === 'write_draft' && !outcome && isMessageOfAccount(target))
      .map((action) => createDraftCommand(action, reportedMessageWithId(reportedMessages, action.target)));
    const pendingCommands = [
      ...archiveCommands,
      ...filterCommands,
      ...deleteFilterCommands,
      ...undoAutomaticCommands,
      ...undoAgentArchiveCommands,
      ...labelCommands,
      ...removeLabelCommands,
      ...draftCommands,
    ].filter((command) => !acknowledgedCommandIds.includes(command.id));
    return context.json({ commands: pendingCommands });
  });
  const listedTaskProposals = () =>
    proposals.flatMap((proposal) =>
      taskProposals({
        accountEmail: proposal.accountEmail,
        link: gmailMessageLink(proposal),
        asks: proposal.asks ?? [],
      }).map((taskProposal, index) => ({ id: `${proposal.messageId}-${String(index)}`, ...taskProposal })),
    );
  const findTaskProposal = (taskId: string) => listedTaskProposals().find(({ id }) => id === taskId);
  app.get('/task-proposals', (context) => {
    const decidedIds = taskEventStore.loadAll().map((event) => event.taskId);
    return context.json({ proposals: listedTaskProposals().filter(({ id }) => !decidedIds.includes(id)) });
  });
  app.post('/task-proposals/:id/confirmation', (context) => {
    const found = findTaskProposal(context.req.param('id'));
    if (found === undefined) return context.body(null, 404);
    const { id, ...proposal } = found;
    taskEventStore.save({ type: 'proposal-confirmed', taskId: id, at: clock.now().toISOString(), proposal });
    return context.json({ confirmed: id });
  });
  app.post('/task-proposals/:id/rejection', (context) => {
    const found = findTaskProposal(context.req.param('id'));
    if (found === undefined) return context.body(null, 404);
    const { id, ...proposal } = found;
    taskEventStore.save({ type: 'proposal-rejected', taskId: id, at: clock.now().toISOString(), proposal });
    return context.json({ rejected: id });
  });
  app.post('/tasks/:id/done', (context) => {
    const taskId = context.req.param('id');
    const isKnownTask = taskEventStore.loadAll().some((event) => event.taskId === taskId);
    if (!isKnownTask) return context.body(null, 404);
    taskEventStore.save({ type: 'done', taskId, at: clock.now().toISOString() });
    return context.json({ done: taskId });
  });
  app.post('/tasks/:id/snooze', async (context) => {
    const taskId = context.req.param('id');
    const { until } = await context.req.json<{ until: string }>();
    taskEventStore.save({ type: 'snoozed', taskId, at: clock.now().toISOString(), until });
    return context.json({ snoozed: taskId });
  });
  app.put('/tasks/:id/waiting-on', async (context) => {
    const taskId = context.req.param('id');
    const { person } = await context.req.json<{ person: string }>();
    taskEventStore.save({ type: 'waiting-on', taskId, at: clock.now().toISOString(), person });
    return context.json({ waitingOn: person });
  });
  app.get('/tasks/:id/history', (context) =>
    context.json({ history: taskHistory(taskEventStore.loadAll(), context.req.param('id')) }),
  );
  const mergedCalendarEvents = () => mergeCalendarSnapshots(snapshotStore.loadAll().map((entry) => entry.snapshot));
  const currentOpenTasks = () => openTasks(taskEventStore.loadAll(), clock.now().toISOString());
  const overdueOpenTasks = () =>
    currentOpenTasks().filter(({ due }) => due !== undefined && due < clock.now().toISOString());
  const profileOfAccount = (accountEmail: string): string | undefined =>
    readOptionalFile(join(options.profileDirectory ?? '', profileFileName(accountEmail)));
  let lastPrioritizationCallAt: number | undefined;
  const isInsidePrioritizationInterval = (): boolean =>
    options.prioritizationIntervalInMilliseconds !== undefined &&
    lastPrioritizationCallAt !== undefined &&
    clock.now().getTime() - lastPrioritizationCallAt < options.prioritizationIntervalInMilliseconds;
  app.post('/prioritization-run', async (context) => {
    const { prioritization } = options;
    if (prioritization === undefined || hasReachedDailySpendCeiling() || isInsidePrioritizationInterval()) {
      return context.json({});
    }
    lastPrioritizationCallAt = clock.now().getTime();
    const tasks = currentOpenTasks().map(({ id, title, accountEmail, due }) => ({ id, title, accountEmail, due }));
    const profile = tasks
      .map(({ accountEmail }) => profileOfAccount(accountEmail))
      .filter((accountProfile) => accountProfile !== undefined)
      .join('\n');
    const calendar = mergedCalendarEvents();
    const urgentContacts = peopleGroups().urgent;
    const result = await prioritization.prioritize({ tasks, profile, calendar, urgentContacts });
    logSpend({ model: result.model, costInUsd: result.costInUsd ?? 0 });
    const answer = taskRanks.safeParse(result);
    if (answer.success) {
      prioritizationStore.saveRanks(answer.data.ranks);
    }
    return context.json({});
  });
  const conversationStore = openConversationStore(databasePath);
  const agentActionStore = openAgentActionStore(databasePath);
  const assistantTurn = (
    reply: { text: string | undefined; citations?: unknown[] | undefined } | undefined,
  ): ConversationTurn => ({
    role: 'assistant',
    text: reply?.text ?? agentUnavailableReply,
    citations: reply?.citations,
  });
  const spendCeilingTurn: ConversationTurn = { role: 'assistant', text: agentSpendCeilingReply };
  const searchMessagesTool: AgentTool = {
    name: 'search_messages',
    description: "Search the user's stored messages by words in their body.",
    inputSchema: stringInputs('query'),
    run: (input) => {
      const { query } = input as { query: string };
      const messages = reportedMessages
        .map((message) => ({ message, matchingWords: countMatchingWords(message.body, query) }))
        .filter(({ matchingWords }) => matchingWords > 0)
        .sort((first, second) => second.matchingWords - first.matchingWords)
        .map(({ message }) => {
          const accountEmail = accountEmailOfReported(message.id);
          return {
            id: message.id,
            accountEmail,
            from: message.from,
            subject: message.subject,
            date: message.date,
            link: gmailMessageLink({ accountEmail, messageId: message.id }),
          };
        });
      return Promise.resolve({ messages });
    },
  };
  const readThreadTool: AgentTool = {
    name: 'read_thread',
    description: 'Read every message in the thread of a message, oldest first.',
    inputSchema: stringInputs('messageId'),
    run: (input) => {
      const { messageId } = input as { messageId: string };
      const threadId = reportedMessages.find((message) => message.id === messageId)?.threadId;
      const messages = reportedMessages
        .filter((message) => message.threadId === threadId)
        .sort((first, second) => new Date(first.date).getTime() - new Date(second.date).getTime())
        .map((message) => ({ id: message.id, body: message.body }));
      return Promise.resolve({ messages });
    },
  };
  const contactTimelineTool: AgentTool = {
    name: 'contact_timeline',
    description: 'List the messages exchanged with a contact, by their email.',
    inputSchema: stringInputs('email'),
    run: (input) => {
      const { email } = input as { email: string };
      return Promise.resolve({ messages: contactTimeline(email) });
    },
  };
  const calendarDayTool: AgentTool = {
    name: 'calendar_day',
    description: 'List the calendar events on a date (YYYY-MM-DD, business time zone).',
    inputSchema: stringInputs('date'),
    run: (input) => {
      const { date } = input as { date: string };
      const events = mergedCalendarEvents().filter(
        (event) => localCalendarDate(event.start, businessTimeZone) === date,
      );
      return Promise.resolve({ events });
    },
  };
  const tasksTool: AgentTool = {
    name: 'tasks',
    description: "List the user's open tasks with their latest priority rank.",
    inputSchema: stringInputs(),
    run: () => {
      const taskRanksFromLastRun = prioritizationStore.loadLatestRanks();
      const tasks = currentOpenTasks().map((task) => ({
        ...task,
        rank: taskRanksFromLastRun.find(({ taskId }) => taskId === task.id)?.rank,
      }));
      return Promise.resolve({ tasks });
    },
  };
  const digestTool: AgentTool = {
    name: 'digest',
    description: "List the digests waiting for the user's confirmation.",
    inputSchema: stringInputs(),
    run: () => {
      const waiting = waitingDigests(verdictStore.loadAll()).map((digest) => {
        const { accountEmail, category } = digest.proposals[0] ?? {};
        return {
          accountEmail,
          category,
          count: digest.proposals.length,
          summaryLines: digestSummaryStore.load(identifyDigest(digest)),
        };
      });
      return Promise.resolve({ digests: waiting });
    },
  };
  const archiveMessageTool: AgentTool = {
    name: 'archive_message',
    description: 'Archive a message.',
    inputSchema: stringInputs('messageId'),
    run: (input) => {
      const { messageId } = input as { messageId: string };
      const isKnownMessage = reportedMessageStore.loadAll().some((message) => message.messageId === messageId);
      if (!isKnownMessage) return Promise.resolve({ error: `No message with id ${messageId}` });
      verdictStore.save({ messageId, decision: 'confirmed', decidedAt: clock.now().toISOString(), decidedBy: 'agent' });
      return Promise.resolve({});
    },
  };
  const labelMessageTool: AgentTool = {
    name: 'label_message',
    description: 'Add a Gmail label to a message.',
    inputSchema: stringInputs('messageId', 'labelName'),
    // The label command is derived from the recorded action, so it survives a restart.
    run: () => Promise.resolve({}),
  };
  const writeDraftTool: AgentTool = {
    name: 'write_draft',
    description: 'Write a Gmail draft reply to a message. Never sends it.',
    inputSchema: stringInputs('messageId', 'body'),
    // The draft command is derived from the recorded action, so it survives a restart.
    run: () => Promise.resolve({}),
  };
  const markVipTool: AgentTool = {
    name: 'mark_vip',
    description: 'Mark a contact as VIP, by their email.',
    inputSchema: stringInputs('email'),
    run: (input) => {
      contactDetailsStore.saveMark((input as { email: string }).email, 'vip');
      return Promise.resolve({});
    },
  };
  const updateContactTool: AgentTool = {
    name: 'update_contact',
    description: "Update a contact's details, by their email.",
    inputSchema: stringInputs('email'),
    run: (input) => {
      const { email, ...details } = input as { email: string } & ContactDetails;
      contactDetailsStore.save(email, details);
      return Promise.resolve({});
    },
  };
  const approveFilterProposalTool: AgentTool = {
    name: 'approve_filter_proposal',
    description: 'Approve a Gmail filter proposal.',
    inputSchema: stringInputs('proposalId'),
    run: (input) => {
      approveFilterProposal((input as { proposalId: string }).proposalId);
      return Promise.resolve({});
    },
  };
  const rejectFilterProposalTool: AgentTool = {
    name: 'reject_filter_proposal',
    description: 'Reject a Gmail filter proposal.',
    inputSchema: stringInputs('proposalId'),
    run: (input) => {
      filterProposalRejectionStore.save((input as { proposalId: string }).proposalId);
      return Promise.resolve({});
    },
  };
  const createTaskToolFor = (conversationId: string): AgentTool => ({
    name: 'create_task',
    description: 'Create a task, optionally linked to the message it came from.',
    inputSchema: stringInputs('title'),
    run: (input) => {
      const { title, sourceMessageId } = input as { title: string; sourceMessageId?: string };
      const source = reportedMessageStore.loadAll().find((message) => message.messageId === sourceMessageId);
      const accountEmail = String(source?.accountEmail);
      const link =
        sourceMessageId === undefined
          ? `#/agent/${conversationId}`
          : gmailMessageLink({ accountEmail, messageId: sourceMessageId });
      const taskId = `agent-${sourceMessageId ?? `${conversationId}-${String(taskEventStore.loadAll().length + 1)}`}`;
      taskEventStore.save({
        type: 'proposal-confirmed',
        taskId,
        at: clock.now().toISOString(),
        proposal: { title, accountEmail, link },
      });
      return Promise.resolve({ taskId });
    },
  });
  const askAgent = async (turns: ConversationTurn[], conversationId: string) => {
    const messagesReturnedThisTurn: { id: string }[] = [];
    const messageTarget = (input: unknown) => (input as { messageId: string }).messageId;
    const emailTarget = (input: unknown) => (input as { email: string }).email;
    const proposalTarget = (input: unknown) => (input as { proposalId: string }).proposalId;
    const createdTaskTarget = (_input: unknown, result: unknown) => (result as { taskId: string }).taskId;
    const recordAction = (
      action: Pick<StoredAgentAction, 'tool' | 'target' | 'undoable' | 'outcome' | 'labelName' | 'body'>,
    ): void => {
      agentActionStore.save({
        id: `action-${String(agentActionStore.loadAll().length + 1)}`,
        conversationId,
        at: clock.now().toISOString(),
        ...action,
      });
    };
    // Every action goes through the domain guardrail: a refused one is recorded and never runs.
    const recordingAction = (
      tool: AgentTool,
      undoable: boolean,
      targetOf: (input: unknown, result: unknown) => string,
    ): AgentTool => ({
      ...tool,
      run: async (input) => {
        const { record } = decideAgentAction({
          tool: tool.name,
          input: input as Record<string, unknown>,
          conversationId,
          requestedAt: clock.now().toISOString(),
        });
        if (record.outcome === 'refused') {
          recordAction({ tool: tool.name, target: messageTarget(input), undoable: false, outcome: 'refused' });
          return { error: `The agent may not use ${tool.name}` };
        }
        const result = await tool.run(input);
        const { labelName, body } = input as Pick<StoredAgentAction, 'labelName' | 'body'>;
        recordAction({
          tool: tool.name,
          target: targetOf(input, result),
          undoable,
          ...(labelName && { labelName }),
          ...(body && { body }),
        });
        return result;
      },
    });
    const forbiddenTool = (name: string, description: string): AgentTool =>
      recordingAction(
        { name, description, inputSchema: stringInputs('messageId'), run: () => Promise.resolve({}) },
        false,
        messageTarget,
      );
    const citingSearchMessagesTool: AgentTool = {
      ...searchMessagesTool,
      run: async (input) => {
        const result = (await searchMessagesTool.run(input)) as { messages: { id: string }[] };
        messagesReturnedThisTurn.push(...result.messages);
        return result;
      },
    };
    const reply = await options.agent?.respond({
      turns,
      tools: [
        citingSearchMessagesTool,
        readThreadTool,
        contactTimelineTool,
        calendarDayTool,
        tasksTool,
        digestTool,
        recordingAction(archiveMessageTool, true, messageTarget),
        recordingAction(labelMessageTool, true, messageTarget),
        recordingAction(writeDraftTool, false, messageTarget),
        recordingAction(createTaskToolFor(conversationId), true, createdTaskTarget),
        recordingAction(markVipTool, true, emailTarget),
        recordingAction(updateContactTool, false, emailTarget),
        recordingAction(approveFilterProposalTool, false, proposalTarget),
        recordingAction(rejectFilterProposalTool, false, proposalTarget),
        forbiddenTool('send_message', 'Send a reply to a message.'),
        forbiddenTool('delete_message', 'Delete a message.'),
      ],
    });
    if (!reply) {
      return undefined;
    }
    logSpend(reply);
    return {
      ...reply,
      citations: reply.citations?.map(
        ({ id }) => messagesReturnedThisTurn.find((message) => message.id === id) ?? { id, verified: false },
      ),
    };
  };
  app.post('/agent/conversations', async (context) => {
    const { message } = await context.req.json<{ message: string }>();
    const userTurn: ConversationTurn = { role: 'user', text: message };
    if (hasReachedDailySpendCeiling()) {
      const turns: ConversationTurn[] = [userTurn, spendCeilingTurn];
      return context.json({ id: '', turns }, 201);
    }
    const id = `conversation-${String(conversationStore.count() + 1)}`;
    const reply = await askAgent([userTurn], id);
    const turns: ConversationTurn[] = [userTurn, assistantTurn(reply)];
    conversationStore.save(id, turns);
    return context.json({ id, turns }, 201);
  });
  app.post('/agent/conversations/:id/messages', async (context) => {
    const id = context.req.param('id');
    const { message } = await context.req.json<{ message: string }>();
    const earlierTurns = conversationStore.load(id) ?? [];
    const turns: ConversationTurn[] = [...earlierTurns, { role: 'user', text: message }];
    const answer = hasReachedDailySpendCeiling() ? spendCeilingTurn : assistantTurn(await askAgent(turns, id));
    conversationStore.save(id, [...turns, answer]);
    return context.json({});
  });
  app.post('/agent/actions/undo', async (context) => {
    const { actionId } = await context.req.json<{ actionId?: string }>();
    const action = agentActionStore.loadAll().find(({ id }) => id === actionId);
    if (action === undefined) return context.body(null, 404);
    const { tool, target } = action;
    if (!action.undoable || action.undone) return context.body(null, 409);
    agentActionStore.markUndone(action.id);
    if (tool === 'create_task') taskEventStore.save({ type: 'undone', taskId: target, at: clock.now().toISOString() });
    else if (tool === 'mark_vip') contactDetailsStore.removeMark(target, 'vip');
    return context.body(null, 200);
  });
  app.get('/agent/actions', (context) => context.json({ actions: agentActionStore.loadAll().reverse() }));
  app.get('/agent/conversations', (context) =>
    context.json({
      conversations: conversationStore
        .listMostRecentlyActiveFirst()
        .map(([id, turns]) => ({ id, title: turns[0]?.text })),
    }),
  );
  app.get('/agent/conversations/:id', (context) => {
    const id = context.req.param('id');
    return context.json({ id, turns: conversationStore.load(id) });
  });
  app.put('/tasks/:id/pin', async (context) => {
    const taskId = context.req.param('id');
    const { pinned } = await context.req.json<{ pinned: boolean }>();
    prioritizationStore.savePin({ taskId, pinned });
    return context.json({ pinned });
  });
  app.get('/tasks', (context) => {
    const taskRanksFromLastRun = prioritizationStore.loadLatestRanks();
    const pinnedTaskIds = prioritizationStore.loadPinnedTaskIds();
    const rankedOpenTasks = currentOpenTasks().map((task) => {
      const ranked = taskRanksFromLastRun.find(({ taskId }) => taskId === task.id);
      return ranked === undefined ? task : { ...task, rank: ranked.rank, reason: ranked.reason };
    });
    const pinnedFirstThenRank = (task: (typeof rankedOpenTasks)[number]) =>
      pinnedTaskIds.has(task.id) ? -Infinity : 'rank' in task ? task.rank : Infinity;
    rankedOpenTasks.sort((first, second) => pinnedFirstThenRank(first) - pinnedFirstThenRank(second));
    return context.json({
      tasks: [...confirmedTasks(proposals, verdictStore.loadAll()), ...rankedOpenTasks],
    });
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
  app.put('/slack-contacts/:workspaceTeamId/:userId/marks/vip', (context) => {
    contactDetailsStore.saveMark(slackContactKey(context.req.param()), 'vip');
    return context.body(null, 200);
  });
  app.put('/telegram-contacts/:userId/marks/vip', (context) => {
    contactDetailsStore.saveMark(telegramContactKey(context.req.param('userId')), 'vip');
    return context.body(null, 200);
  });
  app.delete(contactMarkRoute, rejectUnknownMark, (context) => {
    const email = context.req.param('email');
    contactDetailsStore.removeMark(email, context.req.param('mark'));
    return context.body(null, 200);
  });
  app.delete('/slack-contacts/:workspaceTeamId/:userId/marks/vip', (context) => {
    contactDetailsStore.removeMark(slackContactKey(context.req.param()), 'vip');
    return context.body(null, 200);
  });
  app.delete('/telegram-contacts/:userId/marks/vip', (context) => {
    contactDetailsStore.removeMark(telegramContactKey(context.req.param('userId')), 'vip');
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
        const primaryEmail = primaryEmailOf(contact);
        return {
          ...contact,
          marks: markedEmails.has(primaryEmail) ? ['vip'] : [],
          ...detailsByEmail[primaryEmail],
        };
      }),
    });
  });
  const contactTimeline = (email: string) => {
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
    return reportedMessages
      .filter((message) => involvesContact(message) || isUserReplyInContactThread(message))
      .toSorted(newestFirst)
      .map((message) => {
        const accountEmail = accountEmailOfReported(message.id);
        const proposal = latestProposalFor(proposals, message.id);
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
  };
  app.get('/contacts/:email/timeline', (context) => {
    const messages = contactTimeline(context.req.param('email'));
    return context.json({ messages });
  });
  const peopleGroups = () => {
    const markedContactKeys = contactDetailsStore.markedEmails();
    const isWrittenInPerson = (message: (typeof reportedMessages)[number]) =>
      message.listId === undefined && !isDigestedCategory(latestProposalFor(proposals, message.id)?.category);
    const writesInPerson = (contact: { messageIds: string[] }) =>
      reportedMessages.some((message) => contact.messageIds.includes(message.id) && isWrittenInPerson(message));
    const isOwnAccount = (contact: { emails: string[] }) => contact.emails.some(isAllowed);
    const contacts = contactsByEmail(reportedSenders(), proposals).filter(
      (contact) => writesInPerson(contact) && !isOwnAccount(contact),
    );
    const alwaysMattersLineOfAccount = (accountEmail: string) => {
      const accountProfile = profileOfAccount(accountEmail);
      return accountProfile === undefined ? '' : alwaysMattersLine(accountProfile);
    };
    const isOnAlwaysMattersLine = (contact: { emails: string[]; messageIds: string[] }) =>
      options.profileDirectory !== undefined &&
      contact.messageIds.some((messageId) =>
        alwaysMattersLineOfAccount(accountEmailOfReported(messageId)).includes(primaryEmailOf(contact)),
      );
    const isVip = (contact: { emails: string[]; messageIds: string[] }) => {
      const primaryEmail = primaryEmailOf(contact);
      return (
        markedContactKeys.has(primaryEmail) ||
        (isOnAlwaysMattersLine(contact) && !contactDetailsStore.userRemovedMark(primaryEmail, 'vip'))
      );
    };
    const conversationMessagesOf = (contact: { messageIds: string[] }) =>
      reportedMessages
        .filter((message) => contact.messageIds.includes(message.id) || message.sentByUser === true)
        .map((message) => {
          const proposal = latestProposalFor(proposals, message.id);
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
      unansweredAskBusinessDays: options.urgency?.unansweredAskBusinessDays ?? defaultUnansweredAskBusinessDays,
      deadlineHours: defaultDeadlineHours,
      vipWaitingBusinessDays: defaultVipWaitingBusinessDays,
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
      urgentContacts.some((urgentContact) => sharePrimaryEmail(urgentContact, contact));
    const mostRecentMessageTime = (contact: { messageIds: string[] }) =>
      Math.max(
        ...reportedMessages
          .filter((message) => contact.messageIds.includes(message.id))
          .map((message) => new Date(message.date).getTime()),
      );
    const storedContactDetails = contactDetailsStore.loadAll();
    const extractedOrganizationOf = (contact: { messageIds: string[] }) =>
      contact.messageIds
        .map((messageId) => latestProposalFor(proposals, messageId)?.organization)
        .find((organization) => organization !== undefined && organization !== '');
    const organizationOf = (contact: { emails: string[]; messageIds: string[] }) => {
      const primaryEmail = primaryEmailOf(contact);
      return (
        storedContactDetails[primaryEmail]?.organization ??
        extractedOrganizationOf(contact) ??
        senderDomain(primaryEmail)
      );
    };
    const withOrganizationAndLastMessage = (contact: { emails: string[]; messageIds: string[] }) => ({
      ...contact,
      organization: organizationOf(contact),
      lastMessageAt: new Date(mostRecentMessageTime(contact)).toISOString(),
    });
    const slackSenderAsContact = (message: SlackMessage) => ({
      channel: 'slack',
      displayName: message.senderName,
      slackHandles: [{ workspaceTeamId: message.workspaceTeamId, userId: message.senderUserId }],
      organization: slackWorkspacePollFor(message.workspaceTeamId)?.name,
      lastMessageAt: slackTimestampAsIso(message.timestamp),
    });
    const isFromSomeoneElse = (message: { sentByUser?: boolean }): boolean => message.sentByUser !== true;
    const telegramSenderAsContact = (message: ChatMessage) => ({
      channel: 'telegram',
      displayName: message.senderName,
      telegramHandles: [{ userId: message.senderId }],
      lastMessageAt: message.time,
    });
    // A contact's own messages plus the user's replies in the same chats, so a reply the user sent clears the wait.
    const urgentChatSender = <Contact extends object>(sender: {
      messages: { threadId: string; receivedAt: string; sentByUser: boolean }[];
      contactKey: string;
      contact: Contact;
    }): (Contact & { reasons: ReturnType<typeof contactUrgency>['reasons'] })[] => {
      const { urgent, reasons } = contactUrgency({
        messages: sender.messages,
        vip: markedContactKeys.has(sender.contactKey),
        now: clock.now().toISOString(),
        settings: urgencySettings,
      });
      return urgent ? [{ ...sender.contact, reasons }] : [];
    };
    const slackMessages = slackMessageStore.listMessages();
    const urgentSlackSenders = newestSlackMessagePerSender(slackMessages.filter(isFromSomeoneElse)).flatMap(
      (newest) => {
        const contactKey = slackSenderContactKey(newest);
        const conversationIds = new Set(
          slackMessages
            .filter((message) => slackSenderContactKey(message) === contactKey)
            .map((message) => message.conversationId),
        );
        return urgentChatSender({
          messages: slackMessages
            .filter(
              (message) =>
                message.workspaceTeamId === newest.workspaceTeamId &&
                conversationIds.has(message.conversationId) &&
                (message.sentByUser === true || slackSenderContactKey(message) === contactKey),
            )
            .map((message) => ({
              threadId: message.conversationId,
              receivedAt: slackTimestampAsIso(message.timestamp),
              sentByUser: message.sentByUser === true,
            })),
          contactKey,
          contact: slackSenderAsContact(newest),
        });
      },
    );
    const telegramMessages = chatMessageStore.listMessages();
    const urgentTelegramSenders = newestMessagePerSender(telegramMessages.filter(isFromSomeoneElse)).flatMap(
      (newest) => {
        const chatIds = new Set(
          telegramMessages.filter((message) => message.senderId === newest.senderId).map((message) => message.chatId),
        );
        return urgentChatSender({
          messages: telegramMessages
            .filter(
              (message) => chatIds.has(message.chatId) && (message.sentByUser || message.senderId === newest.senderId),
            )
            .map((message) => ({ threadId: message.chatId, receivedAt: message.time, sentByUser: message.sentByUser })),
          contactKey: telegramContactKey(newest.senderId),
          contact: telegramSenderAsContact(newest),
        });
      },
    );
    const isFromMarkedTelegramSender = (message: { senderId: string }): boolean =>
      markedContactKeys.has(telegramContactKey(message.senderId));
    const isFromMarkedSlackSender = (message: SlackMessage): boolean =>
      markedContactKeys.has(slackSenderContactKey(message));
    return {
      urgent: [...urgentContacts.map(withOrganizationAndLastMessage), ...urgentSlackSenders, ...urgentTelegramSenders],
      vip: [
        ...contacts.filter(isVip).map(withOrganizationAndLastMessage),
        ...newestMessagePerSender(telegramMessages.filter(isFromMarkedTelegramSender)).map(telegramSenderAsContact),
        ...newestSlackMessagePerSender(slackMessages.filter(isFromMarkedSlackSender)).map(slackSenderAsContact),
      ],
      everyoneElse: [
        ...contacts
          .filter((contact) => !isVip(contact) && !isUrgent(contact))
          .sort((first, second) => mostRecentMessageTime(second) - mostRecentMessageTime(first))
          .map(withOrganizationAndLastMessage),
        ...newestSlackMessagePerSender(
          slackMessages.filter(isFromSomeoneElse).filter((message) => !isFromMarkedSlackSender(message)),
        ).map(slackSenderAsContact),
        ...newestMessagePerSender(
          telegramMessages
            .filter(isFromSomeoneElse)
            .filter((message) => !message.chatIsBot && !isFromMarkedTelegramSender(message)),
        ).map(telegramSenderAsContact),
      ],
    };
  };
  app.get('/people', (context) => context.json(peopleGroups()));
  app.get('/waiting-on', (context) => {
    const userRepliedLaterInThread = (message: ReportedMessage): boolean =>
      reportedMessages.some((other) => isLaterUserReplyTo(message, other));
    const isAutomatedCategory = (category: string | undefined): boolean =>
      isDigestedCategory(category) || category === 'expense';
    const isAutomatedMail = (message: ReportedMessage): boolean =>
      message.listId !== undefined || isAutomatedCategory(latestProposalFor(proposals, message.id)?.category);
    const awaitsReply = (message: ReportedMessage): boolean =>
      message.sentByUser !== true && !isAutomatedMail(message) && !userRepliedLaterInThread(message);
    const waitingTimesOf = (contact: { messageIds: string[] }): number[] =>
      reportedMessages
        .filter((message) => contact.messageIds.includes(message.id) && awaitsReply(message))
        .map((message) => new Date(message.date).getTime());
    const people = contactsByEmail(reportedSenders(), proposals)
      .map((contact) => ({ contact, waitingTimes: waitingTimesOf(contact) }))
      .filter(({ waitingTimes }) => waitingTimes.length > 0)
      .map(({ contact, waitingTimes }) => ({
        email: primaryEmailOf(contact),
        displayName: contact.displayName,
        waitingSince: new Date(Math.min(...waitingTimes)).toISOString(),
      }));
    const slackMessages = slackMessageStore.listMessages();
    const userRepliedLaterInConversation = (message: (typeof slackMessages)[number]): boolean =>
      slackMessages.some(
        (reply) =>
          reply.sentByUser === true &&
          reply.conversationId === message.conversationId &&
          Number(reply.timestamp) > Number(message.timestamp),
      );
    const slackPeople = slackMessages
      .filter((message) => message.sentByUser !== true && !userRepliedLaterInConversation(message))
      .map((message) => ({
        channel: 'slack',
        displayName: message.senderName,
        waitingSince: slackTimestampAsIso(message.timestamp),
      }));
    const chatMessages = chatMessageStore.listMessages();
    const userRepliedLaterInChat = (message: (typeof chatMessages)[number]): boolean =>
      chatMessages.some(
        (reply) =>
          reply.sentByUser &&
          reply.channel === message.channel &&
          reply.chatId === message.chatId &&
          reply.time > message.time,
      );
    const awaitsUserReply = (message: (typeof chatMessages)[number]): boolean =>
      !message.sentByUser && !message.chatIsBot && !userRepliedLaterInChat(message);
    // One entry per sender in each chat, waiting since their first unanswered message (the store lists oldest first).
    const firstUnansweredMessageBySender = new Map<string, (typeof chatMessages)[number]>();
    for (const message of chatMessages.filter(awaitsUserReply)) {
      const senderKey = `${message.channel}/${message.chatId}/${message.senderId}`;
      if (!firstUnansweredMessageBySender.has(senderKey)) firstUnansweredMessageBySender.set(senderKey, message);
    }
    const telegramPeople = [...firstUnansweredMessageBySender.values()].map((message) => ({
      channel: 'telegram',
      displayName: message.senderName,
      waitingSince: message.time,
    }));
    return context.json({
      people: [...people, ...slackPeople, ...telegramPeople].toSorted((first, second) =>
        first.waitingSince.localeCompare(second.waitingSince),
      ),
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
        accountEmail: accountEmailOfReported(message.id),
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
    const events = mergedCalendarEvents();
    return context.json({
      ...buildNowView(events, clock, businessTimeZone),
      accounts: describeAccountFreshness(stored, clock),
      badgeCount:
        badgeCount(events, clock, awaitingTheUser(proposals), verdictStore.loadAll()) +
        needsInputQuestions().length +
        overdueOpenTasks().length,
      sources: describeSourceFreshness(mailSourceStore.loadAll(), configuredPollingIntervalsInMilliseconds, clock),
      slackWorkspaces: slackWorkspacePolls?.map(describeSlackWorkspaceFreshness),
      telegram: describeTelegramConnection(),
      whatsapp: whatsappStatus,
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

function reportedMessageWithId(messages: ReportedMessage[], messageId: string): ReportedMessage | undefined {
  return messages.find((message) => message.id === messageId);
}

function createDraftCommand({ id, body }: StoredAgentAction, repliedToMessage: ReportedMessage | undefined) {
  return {
    id: `draft-${id}`,
    type: 'create-draft',
    threadId: repliedToMessage?.threadId,
    to: [contactFromSender(String(repliedToMessage?.from)).email],
    subject: `Re: ${String(repliedToMessage?.subject)}`,
    body,
  };
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

function slackTimestampAsIso(timestamp: string): string {
  return new Date(Number(timestamp) * 1000).toISOString();
}

function slackContactKey({ workspaceTeamId, userId }: { workspaceTeamId: string; userId: string }): string {
  return `slack:${workspaceTeamId}/${userId}`;
}

function telegramContactKey(userId: string): string {
  return `telegram:${userId}`;
}

function telegramChatLink(chatId: string): string {
  return `https://web.telegram.org/k/#${chatId}`;
}

function slackClientLink(message: SlackMessageReference): string {
  return `https://app.slack.com/client/${message.workspaceTeamId}/${message.conversationId}/p${message.timestamp.replace('.', '')}`;
}

function senderDomain(from: string): string {
  const { email } = contactFromSender(from);
  return email.slice(email.indexOf('@') + 1);
}

function alwaysMattersLine(profile: string): string {
  return profile.split('\n').find((line) => line.startsWith('- Always matters:')) ?? '';
}

// One contact per email: a message's sender and every person its extraction names with an email, each listing the
// messages they sent or appear in. The sender's own display name wins over a name the extraction gives.
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
