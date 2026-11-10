import type { SlackMessageStore } from './slack-message-store';

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
}

async function callSlack<Response>(input: PollSlackWorkspaceInput, path: string): Promise<Response> {
  const response = await input.fetch(`${input.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${input.workspace.userToken}` },
  });
  if (response.status === 429) {
    const retryAfterMilliseconds = Number(response.headers.get('Retry-After')) * 1000;
    await input.wait?.(retryAfterMilliseconds);
    return callSlack<Response>(input, path);
  }
  const body = (await response.json()) as Response & { error?: string };
  if (body.error === 'invalid_auth') {
    throw new Error(`Slack workspace ${input.workspace.teamId} answered invalid_auth`);
  }
  return body;
}

async function fetchOwnSlackUserId(input: PollSlackWorkspaceInput): Promise<string> {
  const { user_id: ownSlackUserId } = await callSlack<{ user_id: string }>(input, '/auth.test');
  return ownSlackUserId;
}

interface SlackMessage {
  user: string;
  text: string;
  ts: string;
}

async function searchSlackMessages<Match>(input: PollSlackWorkspaceInput, query: string, page = 1): Promise<Match[]> {
  const pageParameter = page === 1 ? '' : `&page=${page}`;
  const { messages } = await callSlack<{ messages: { matches: Match[] } }>(
    input,
    `/search.messages?query=${encodeURIComponent(query)}&sort=timestamp&sort_dir=desc${pageParameter}`,
  );
  return messages.matches;
}

async function fetchSlackDisplayName(input: PollSlackWorkspaceInput, userId: string): Promise<string> {
  const { user } = await callSlack<{ user: { profile: { display_name?: string; real_name?: string } } }>(
    input,
    `/users.info?user=${userId}`,
  );
  // Slack answers an empty display_name, not a missing one, for a user who never set one.
  const names = [user.profile.display_name, user.profile.real_name].filter((name) => name !== undefined && name !== '');
  return names[0] ?? userId;
}

async function saveSlackMessage(
  input: PollSlackWorkspaceInput,
  conversationId: string,
  message: SlackMessage,
  { threadTimestamp, ownSlackUserId }: { threadTimestamp?: string; ownSlackUserId?: string } = {},
): Promise<void> {
  const senderName = await fetchSlackDisplayName(input, message.user);
  input.store.saveMessage({
    workspaceTeamId: input.workspace.teamId,
    conversationId,
    senderUserId: message.user,
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

const sevenDaysInMilliseconds = 7 * 24 * 60 * 60 * 1000;

function isEntirelyNewerThan(pageMatches: { ts: string }[], newestStoredTimestamp: string | undefined): boolean {
  return (
    newestStoredTimestamp !== undefined &&
    pageMatches.length > 0 &&
    pageMatches.every((match) => match.ts > newestStoredTimestamp)
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
  const matches = await searchSlackMessages<DirectMessageMatch>(input, query);
  let page = 1;
  let pageMatches = matches;
  while (isEntirelyNewerThan(pageMatches, newestStoredTimestamp)) {
    page += 1;
    pageMatches = await searchSlackMessages<DirectMessageMatch>(input, query, page);
    matches.push(...pageMatches);
  }
  return matches;
}

function dateSevenDaysBefore(now: Date): string {
  return new Date(now.getTime() - sevenDaysInMilliseconds).toISOString().slice(0, 10);
}

async function searchedDirectMessageChannels(input: PollSlackWorkspaceInput): Promise<{ id: string }[]> {
  const query = `is:dm after:${dateSevenDaysBefore(input.clock.now())}`;
  const matches = await searchPagesUntilCaughtUp(input, query, newestStoredTimestampOverall(input.store));
  return matches.map((match) => match.channel);
}

async function pollDirectMessages(input: PollSlackWorkspaceInput): Promise<void> {
  const ownSlackUserId = await fetchOwnSlackUserId(input);
  const directMessageChannels = await searchedDirectMessageChannels(input);
  for (const channel of directMessageChannels) {
    const oldestParameter = oldestParameterAfter(newestStoredTimestampIn(input.store, channel.id));
    const { messages } = await callSlack<{ messages: SlackMessage[] }>(
      input,
      `/conversations.history?channel=${channel.id}${oldestParameter}`,
    );
    for (const message of messages) {
      await saveSlackMessage(input, channel.id, message, { ownSlackUserId });
    }
  }
}

async function pollMentions(input: PollSlackWorkspaceInput): Promise<void> {
  const ownSlackUserId = await fetchOwnSlackUserId(input);
  const mentionsQuery = `<@${ownSlackUserId}>`;
  const matches = await searchSlackMessages<SlackMessage & { channel: { id: string } }>(input, mentionsQuery);
  for (const match of matches) {
    await saveSlackMessage(input, match.channel.id, match, { ownSlackUserId });
  }
}

// Slack's search matches carry no thread_ts; a reply names its thread only in its permalink's query.
function threadTimestampOf(match: { permalink?: string }): string | null {
  return match.permalink === undefined ? null : new URL(match.permalink).searchParams.get('thread_ts');
}

async function pollThreadsTheUserWroteIn(input: PollSlackWorkspaceInput): Promise<void> {
  const ownSlackUserId = await fetchOwnSlackUserId(input);
  const ownMessagesQuery = `from:<@${ownSlackUserId}>`;
  const matches = await searchSlackMessages<{ permalink?: string; channel: { id: string } }>(input, ownMessagesQuery);
  for (const match of matches) {
    const threadTimestamp = threadTimestampOf(match);
    if (threadTimestamp === null) {
      continue;
    }
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

export async function pollSlackWorkspace(input: PollSlackWorkspaceInput): Promise<void> {
  await pollDirectMessages(input);
  await pollMentions(input);
  await pollThreadsTheUserWroteIn(input);
}

type PollSlackWorkspacesInput = Omit<PollSlackWorkspaceInput, 'workspace'> & { workspaces: SlackWorkspace[] };

export async function pollSlackWorkspaces({ workspaces, ...input }: PollSlackWorkspacesInput): Promise<Set<string>> {
  const succeededTeamIds = new Set<string>();
  for (const workspace of workspaces) {
    try {
      await pollSlackWorkspace({ ...input, workspace });
      succeededTeamIds.add(workspace.teamId);
    } catch {
      // A workspace that fails (e.g. invalid_auth) is skipped so the others are still polled.
    }
  }
  return succeededTeamIds;
}
