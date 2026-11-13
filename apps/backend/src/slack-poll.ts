import type { SlackMessageStore } from './slack-message-store';
import { defaultSlackFirstPollLookbackDays } from './startup-settings';

interface SlackWorkspace {
  teamId: string;
  userToken: string;
}

interface PollSlackWorkspaceInput {
  fetch: typeof fetch;
  apiUrl: string;
  workspace: SlackWorkspace;
  store: SlackMessageStore;
  wait?: (milliseconds: number) => Promise<void>;
  clock: { now: () => Date };
  firstPollLookbackDays?: number;
  displayNamesByUserId?: Map<string, string>;
}

const toleratedSlackErrors = new Set(['user_not_found']);
const ratelimitedRetryDelayMilliseconds = 1000;
const ratelimitedAttemptLimit = 3;

async function callSlack<Response>(
  input: PollSlackWorkspaceInput,
  path: string,
  ratelimitedAttempt = 1,
): Promise<Response> {
  const response = await input.fetch(`${input.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${input.workspace.userToken}` },
  });
  if (response.status === 429) {
    const retryAfterMilliseconds = Number(response.headers.get('Retry-After')) * 1000;
    await input.wait?.(retryAfterMilliseconds);
    return callSlack<Response>(input, path);
  }
  const body = (await response.json()) as Response & { error?: string };
  if (body.error === 'ratelimited' && ratelimitedAttempt < ratelimitedAttemptLimit) {
    await input.wait?.(ratelimitedRetryDelayMilliseconds);
    return callSlack<Response>(input, path, ratelimitedAttempt + 1);
  }
  if (body.error !== undefined && !toleratedSlackErrors.has(body.error)) {
    throw new Error(`Slack workspace ${input.workspace.teamId} answered ${body.error}`, { cause: body.error });
  }
  return body;
}

async function fetchOwnSlackUserId(input: PollSlackWorkspaceInput): Promise<string> {
  const { user_id: ownSlackUserId } = await callSlack<{ user_id: string }>(input, '/auth.test');
  return ownSlackUserId;
}

// A person's message names its user; an app's message has no user, only a bot id and the username it posts as.
interface SlackMessage {
  user?: string;
  bot_id?: string;
  username?: string;
  text: string;
  ts: string;
}

// Slack's search matches: a message with its channel, and a permalink that names its thread, if any.
type SlackSearchMatch = SlackMessage & { permalink?: string; channel: { id: string } };

async function searchSlackMessagesPage(
  input: PollSlackWorkspaceInput,
  query: string,
  page: number,
): Promise<{ matches: SlackSearchMatch[]; pages: number }> {
  const pageParameter = page === 1 ? '' : `&page=${String(page)}`;
  const { messages } = await callSlack<{ messages: { matches: SlackSearchMatch[]; paging?: { pages: number } } }>(
    input,
    `/search.messages?query=${encodeURIComponent(query)}&sort=timestamp&sort_dir=desc&count=100${pageParameter}`,
  );
  return { matches: messages.matches, pages: messages.paging?.pages ?? 1 };
}

async function searchSlackMessages(input: PollSlackWorkspaceInput, query: string): Promise<SlackSearchMatch[]> {
  return (await searchSlackMessagesPage(input, query, 1)).matches;
}

async function lookUpSlackDisplayName(input: PollSlackWorkspaceInput, userId: string): Promise<string> {
  // users.info answers no user for a sender it cannot find (an app, a deleted or foreign user): the id stands in.
  const { user } = await callSlack<{ user?: { profile: { display_name?: string; real_name?: string } } }>(
    input,
    `/users.info?user=${userId}`,
  );
  if (user === undefined) return userId;
  // Slack answers an empty display_name, not a missing one, for a user who never set one.
  const names = [user.profile.display_name, user.profile.real_name].filter((name) => name !== undefined && name !== '');
  return names[0] ?? userId;
}

async function fetchSlackDisplayName(input: PollSlackWorkspaceInput, userId: string): Promise<string> {
  const knownName = input.displayNamesByUserId?.get(userId);
  if (knownName !== undefined) {
    return knownName;
  }
  const displayName = await lookUpSlackDisplayName(input, userId);
  input.displayNamesByUserId?.set(userId, displayName);
  return displayName;
}

async function saveSlackMessage(
  input: PollSlackWorkspaceInput,
  conversationId: string,
  message: SlackMessage,
  { threadTimestamp, ownSlackUserId }: { threadTimestamp?: string; ownSlackUserId?: string } = {},
): Promise<void> {
  const senderUserId = message.user ?? message.bot_id ?? '';
  const senderName =
    message.user === undefined ? (message.username ?? senderUserId) : await fetchSlackDisplayName(input, message.user);
  input.store.saveMessage({
    workspaceTeamId: input.workspace.teamId,
    conversationId,
    senderUserId,
    senderName,
    text: message.text,
    timestamp: message.ts,
    threadTimestamp,
    sentByUser: message.user === ownSlackUserId,
  });
}

function newestTimestampOf(messages: { timestamp: string }[]): string | undefined {
  return messages
    .map((message) => message.timestamp)
    .sort()
    .at(-1);
}

function newestStoredTimestampIn(store: SlackMessageStore, conversationId: string): string | undefined {
  return newestTimestampOf(store.listMessages().filter((message) => message.conversationId === conversationId));
}

function newestStoredTimestampOverall(store: SlackMessageStore): string | undefined {
  return newestTimestampOf(store.listMessages());
}

function oldestParameterAfter(newestStoredTimestamp: string | undefined): string {
  return newestStoredTimestamp === undefined ? '' : `&oldest=${newestStoredTimestamp}`;
}

// With nothing stored, every page is unread; otherwise a page is unread while all its matches are newer than the store.
function isEntirelyNewerThan(pageMatches: { ts: string }[], newestStoredTimestamp: string | undefined): boolean {
  return (
    pageMatches.length > 0 &&
    (newestStoredTimestamp === undefined || pageMatches.every((match) => match.ts > newestStoredTimestamp))
  );
}

interface DirectMessageMatch {
  ts: string;
  channel: { id: string };
}

async function searchPagesUntilCaughtUp(
  input: PollSlackWorkspaceInput,
  query: string,
  newestStoredTimestamp: string | undefined,
): Promise<DirectMessageMatch[]> {
  const firstPage = await searchSlackMessagesPage(input, query, 1);
  const matches = firstPage.matches;
  let page = 1;
  let pageMatches = matches;
  while (page < firstPage.pages && isEntirelyNewerThan(pageMatches, newestStoredTimestamp)) {
    page += 1;
    pageMatches = (await searchSlackMessagesPage(input, query, page)).matches;
    matches.push(...pageMatches);
  }
  return matches;
}

const oneDayInMilliseconds = 24 * 60 * 60 * 1000;

function firstPollLookbackDays(input: PollSlackWorkspaceInput): number {
  return input.firstPollLookbackDays ?? defaultSlackFirstPollLookbackDays;
}

function firstPollLookbackStartInMilliseconds(input: PollSlackWorkspaceInput): number {
  return input.clock.now().getTime() - firstPollLookbackDays(input) * oneDayInMilliseconds;
}

function lookbackSearchFilter(input: PollSlackWorkspaceInput): string {
  return `after:${new Date(firstPollLookbackStartInMilliseconds(input)).toISOString().slice(0, 10)}`;
}

async function searchedDirectMessageChannels(input: PollSlackWorkspaceInput): Promise<{ id: string }[]> {
  const query = `is:dm ${lookbackSearchFilter(input)}`;
  const matches = await searchPagesUntilCaughtUp(input, query, newestStoredTimestampOverall(input.store));
  // A busy DM names its conversation in many matches; each conversation's history is read once.
  const conversationIds = new Set(matches.map((match) => match.channel.id));
  return [...conversationIds].map((id) => ({ id }));
}

async function pollDirectMessages(input: PollSlackWorkspaceInput, ownSlackUserId: string): Promise<void> {
  const directMessageChannels = await searchedDirectMessageChannels(input);
  const firstPollLookbackStart = String(firstPollLookbackStartInMilliseconds(input) / 1000);
  for (const channel of directMessageChannels) {
    const oldestParameter = oldestParameterAfter(
      newestStoredTimestampIn(input.store, channel.id) ?? firstPollLookbackStart,
    );
    let cursorParameter = '';
    for (;;) {
      const page = await callSlack<{
        messages: SlackMessage[];
        has_more?: boolean;
        response_metadata: { next_cursor: string };
      }>(input, `/conversations.history?channel=${channel.id}${oldestParameter}${cursorParameter}`);
      for (const message of page.messages) {
        await saveSlackMessage(input, channel.id, message, { ownSlackUserId });
      }
      if (page.has_more !== true) {
        break;
      }
      cursorParameter = `&cursor=${page.response_metadata.next_cursor}`;
    }
  }
}

async function pollMentions(input: PollSlackWorkspaceInput, ownSlackUserId: string): Promise<void> {
  const mentionsQuery = `<@${ownSlackUserId}> ${lookbackSearchFilter(input)}`;
  const matches = await searchSlackMessages(input, mentionsQuery);
  for (const match of matches) {
    await saveSlackMessage(input, match.channel.id, match, { ownSlackUserId });
  }
}

// Slack's search matches carry no thread_ts; a reply names its thread only in its permalink's query.
function threadTimestampOf(match: { permalink?: string }): string | null {
  return match.permalink === undefined ? null : new URL(match.permalink).searchParams.get('thread_ts');
}

async function pollThreadsTheUserWroteIn(input: PollSlackWorkspaceInput, ownSlackUserId: string): Promise<void> {
  const ownMessagesQuery = `from:<@${ownSlackUserId}> ${lookbackSearchFilter(input)}`;
  const matches = await searchSlackMessages(input, ownMessagesQuery);
  // Several of the user's messages in one thread name it several times; each thread's replies are read once.
  const readThreads = new Set<string>();
  for (const match of matches) {
    const threadTimestamp = threadTimestampOf(match);
    const threadKey = `${match.channel.id}/${String(threadTimestamp)}`;
    if (threadTimestamp === null || readThreads.has(threadKey)) {
      continue;
    }
    readThreads.add(threadKey);
    const newestStoredReplyTimestamp = input.store.newestTimestampInThread(match.channel.id, threadTimestamp);
    const oldestParameter = oldestParameterAfter(newestStoredReplyTimestamp);
    const { messages: replies } = await callSlack<{ messages: SlackMessage[] }>(
      input,
      `/conversations.replies?channel=${match.channel.id}&ts=${threadTimestamp}${oldestParameter}`,
    );
    for (const reply of replies) {
      await saveSlackMessage(input, match.channel.id, reply, { threadTimestamp, ownSlackUserId });
    }
  }
}

export async function pollSlackWorkspace(pollInput: PollSlackWorkspaceInput): Promise<void> {
  const input = { ...pollInput, displayNamesByUserId: pollInput.displayNamesByUserId ?? new Map<string, string>() };
  const ownSlackUserId = await fetchOwnSlackUserId(input);
  await pollDirectMessages(input, ownSlackUserId);
  await pollMentions(input, ownSlackUserId);
  await pollThreadsTheUserWroteIn(input, ownSlackUserId);
}

type PollSlackWorkspacesInput = Omit<PollSlackWorkspaceInput, 'workspace'> & {
  workspaces: SlackWorkspace[];
  logPollFailure?: (teamId: string, error: unknown) => void;
};

export async function pollSlackWorkspaces({
  workspaces,
  logPollFailure,
  ...input
}: PollSlackWorkspacesInput): Promise<Set<string>> {
  const succeededTeamIds = new Set<string>();
  for (const workspace of workspaces) {
    try {
      await pollSlackWorkspace({ ...input, workspace });
      succeededTeamIds.add(workspace.teamId);
    } catch (error) {
      // A workspace that fails (e.g. invalid_auth) is skipped so the others are still polled.
      logPollFailure?.(workspace.teamId, error);
    }
  }
  return succeededTeamIds;
}
