// Drives the shipped composition (main.ts) as a process against a fake Anthropic server, so the wiring between the
// startup settings and the Claude adapters is pinned from the outside.

import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  budgetReviewReport,
  budgetReviewReportWithQuarterlyNumbersBody,
  profileDirectoryWith,
  temporaryDatabasePath,
} from './app.test-support';

interface RecordedAnthropicRequest {
  model: string;
  system?: unknown;
  tools: { name: string; description?: string }[];
  messages?: { role: string; content: unknown }[];
}

const writtenSummaryLines = ['GitHub: one build passed, nothing significant'];
const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

function toolUseAnswer(request: RecordedAnthropicRequest) {
  const toolName = request.tools[0]?.name ?? '';
  const input =
    toolName === 'propose_triage'
      ? {
          action: 'archive',
          category: 'system-update',
          summary: 'GitHub build passed',
          extract: { system: 'GitHub', severity: 'low', significant: false },
          reason: 'A routine notification',
        }
      : { lines: writtenSummaryLines };
  return {
    id: 'message-from-fake',
    type: 'message',
    role: 'assistant',
    model: request.model,
    content: [{ type: 'tool_use', id: 'tool-use-1', name: toolName, input }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

async function startFakeAnthropic(
  recorded: RecordedAnthropicRequest[],
  answer: (request: RecordedAnthropicRequest) => unknown = toolUseAnswer,
): Promise<Server> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const parsed = JSON.parse(body) as RecordedAnthropicRequest;
      recorded.push(parsed);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer(parsed)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) =>
    probe.close(() => {
      resolve();
    }),
  );
  return port;
}

async function waitUntilHealthy(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const healthy = await fetch(`${baseUrl}/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (healthy) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('the shipped backend never answered /health');
}

async function waitUntilRecorded(
  recorded: RecordedAnthropicRequest[],
  matches: (request: RecordedAnthropicRequest) => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 50 && !recorded.some(matches); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Step back a day at a time until the day after it up to now holds a weekday.
function oneBusinessDayAgo(): Date {
  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  const weekdayIn = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Mexico_City' });
  const isWeekend = (time: number) => ['Sat', 'Sun'].includes(weekdayIn.format(time));
  let time = Date.now() - dayInMilliseconds;
  while (isWeekend(time + dayInMilliseconds)) {
    time -= dayInMilliseconds;
  }
  return new Date(time);
}

describe('the shipped backend (main.ts)', () => {
  let backend: ChildProcess | undefined;
  let fakeAnthropic: Server | undefined;

  afterEach(() => {
    backend?.kill();
    fakeAnthropic?.close();
  });

  async function startShippedBackend(anthropic: Server, environment: Record<string, string>): Promise<string> {
    const anthropicPort = (anthropic.address() as AddressInfo).port;
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${String(port)}`;
    backend = spawn('node_modules/.bin/tsx', ['src/main.ts'], {
      cwd: backendDirectory,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(anthropicPort)}`,
        MY_LIFE_PORT: String(port),
        MY_LIFE_DATABASE_PATH: temporaryDatabasePath(),
        MY_LIFE_ALLOWED_EMAILS: 'ana@example.com',
        MY_LIFE_TRIAGE_ESCALATION_MODEL: 'none',
        ...environment,
      },
      stdio: 'ignore',
    });
    await waitUntilHealthy(baseUrl);
    return baseUrl;
  }

  async function postMailReport(baseUrl: string, report: unknown): Promise<void> {
    await fetch(`${baseUrl}/mail-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
    });
  }

  async function getJson<Body>(url: string): Promise<Body> {
    return (await (await fetch(url)).json()) as Body;
  }

  it('writes digest summary lines with the Claude summary adapter on the configured summary model', async () => {
    const recorded: RecordedAnthropicRequest[] = [];
    fakeAnthropic = await startFakeAnthropic(recorded);
    const baseUrl = await startShippedBackend(fakeAnthropic, {
      MY_LIFE_TRIAGE_MODEL: 'claude-haiku-5-5',
      MY_LIFE_SUMMARY_MODEL: 'claude-sonnet-5-5',
    });
    const [budgetReview] = budgetReviewReport.messages;
    await postMailReport(baseUrl, {
      ...budgetReviewReport,
      messages: [
        { ...budgetReview, id: 'message-build', threadId: 'message-build', from: 'GitHub <noreply@github.com>' },
      ],
    });

    await fetch(`${baseUrl}/triage-run`, { method: 'POST' });

    const { digests } = await getJson<{ digests: unknown[] }>(`${baseUrl}/triage-queue`);
    expect(digests).toEqual([expect.objectContaining({ key: 'GitHub', summaryLines: writtenSummaryLines })]);
    expect(recorded).toContainEqual(
      expect.objectContaining({
        model: 'claude-sonnet-5-5',
        tools: [expect.objectContaining({ name: 'write_summary' })],
      }),
    );
  }, 30_000);

  it('lists at GET /people under Urgent a contact whose unanswered ask is 1 business day old when MY_LIFE_UNANSWERED_ASK_BUSINESS_DAYS is 1', async () => {
    fakeAnthropic = await startFakeAnthropic([], (request) => ({
      ...toolUseAnswer(request),
      content: [
        {
          type: 'tool_use',
          id: 'tool-use-1',
          name: 'propose_triage',
          input: {
            action: 'keep',
            category: 'unknown',
            summary: 'A budget review',
            extract: {},
            reason: 'Unsure',
            asks: [{ ask: 'Review the budget' }],
          },
        },
      ],
    }));
    const baseUrl = await startShippedBackend(fakeAnthropic, {
      MY_LIFE_TRIAGE_MODEL: 'claude-haiku-5-5',
      MY_LIFE_UNANSWERED_ASK_BUSINESS_DAYS: '1',
    });
    const askedAt = oneBusinessDayAgo().toISOString();
    const [budgetReview] = budgetReviewReport.messages;
    await postMailReport(baseUrl, { ...budgetReviewReport, messages: [{ ...budgetReview, date: askedAt }] });
    await fetch(`${baseUrl}/triage-run`, { method: 'POST' });

    const { urgent } = await getJson<{ urgent: { emails: string[]; reasons: string[] }[] }>(`${baseUrl}/people`);

    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['unanswered ask'] })]);
  }, 30_000);
  it('lists at GET /people under VIP a contact on the "Always matters" line of a profile in MY_LIFE_PROFILE_DIRECTORY', async () => {
    fakeAnthropic = await startFakeAnthropic([]);
    const profileDirectory = profileDirectoryWith({
      'example.md': '## People\n\n- Always matters: luis@example.com\n- Never matters: (to fill)\n',
    });
    const baseUrl = await startShippedBackend(fakeAnthropic, {
      MY_LIFE_PROFILE_DIRECTORY: profileDirectory,
    });
    await postMailReport(baseUrl, budgetReviewReport);

    const { vip } = await getJson<{ vip: { emails: string[] }[] }>(`${baseUrl}/people`);

    expect(vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
  }, 30_000);

  it('runs the prioritization pass on its own at startup, asking the default prioritization model through rank_tasks under its prompt file', async () => {
    const recorded: RecordedAnthropicRequest[] = [];
    fakeAnthropic = await startFakeAnthropic(recorded);
    await startShippedBackend(fakeAnthropic, {});
    const isPrioritizationRequest = (request: RecordedAnthropicRequest) =>
      request.tools.some(({ name }) => name === 'rank_tasks');

    await waitUntilRecorded(recorded, isPrioritizationRequest);

    expect(recorded.find(isPrioritizationRequest)).toEqual(
      expect.objectContaining({ model: 'claude-opus-5-5', system: expect.stringMatching(/\S/) as unknown }),
    );
  }, 30_000);

  it('answers an agent message through Claude on the agent model under prompts/agent-v1.md, running a search the agent asks for against the stored messages', async () => {
    const recorded: RecordedAnthropicRequest[] = [];
    const agentReplyText = 'Luis sent the quarterly numbers.';
    const isAgentRequest = (request: RecordedAnthropicRequest) =>
      request.tools.some(({ name }) => name === 'search_messages');
    fakeAnthropic = await startFakeAnthropic(recorded, (request) => {
      if (!isAgentRequest(request)) return toolUseAnswer(request);
      const searchedAlready = JSON.stringify(request.messages).includes('tool_result');
      return {
        ...toolUseAnswer(request),
        content: searchedAlready
          ? [{ type: 'text', text: agentReplyText }]
          : [{ type: 'tool_use', id: 'search-1', name: 'search_messages', input: { query: 'quarterly numbers' } }],
        stop_reason: searchedAlready ? 'end_turn' : 'tool_use',
      };
    });
    const baseUrl = await startShippedBackend(fakeAnthropic, { MY_LIFE_AGENT_MODEL: 'claude-sonnet-5-5' });
    await postMailReport(baseUrl, budgetReviewReportWithQuarterlyNumbersBody);

    const conversation = (await (
      await fetch(`${baseUrl}/agent/conversations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Did Luis send the quarterly numbers?' }),
      })
    ).json()) as { turns: { role: string; text: string }[] };

    expect(conversation.turns.at(-1)).toEqual(expect.objectContaining({ role: 'assistant', text: agentReplyText }));
    const agentRequests = recorded.filter(isAgentRequest);
    expect(agentRequests.map(({ model }) => model)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5-5']);
    expect(JSON.stringify(agentRequests[1]?.messages)).toContain('message-1');
    const agentPrompt = readFileSync(new URL('../prompts/agent-v1.md', import.meta.url), 'utf8');
    expect(agentRequests[0]?.system).toEqual(expect.stringContaining(agentPrompt.trim()));
  }, 30_000);

  it('offers Claude every agent tool with its description, the refused send_message and delete_message included', async () => {
    const recorded: RecordedAnthropicRequest[] = [];
    const isAgentRequest = (request: RecordedAnthropicRequest) =>
      request.tools.some(({ name }) => name === 'search_messages');
    fakeAnthropic = await startFakeAnthropic(recorded, (request) =>
      isAgentRequest(request)
        ? { ...toolUseAnswer(request), content: [{ type: 'text', text: 'Nothing found.' }], stop_reason: 'end_turn' }
        : toolUseAnswer(request),
    );
    const baseUrl = await startShippedBackend(fakeAnthropic, {});

    await fetch(`${baseUrl}/agent/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Anything new from Luis?' }),
    });

    const offeredTools = recorded.find(isAgentRequest)?.tools ?? [];
    expect(offeredTools.map(({ name }) => name)).toEqual(expect.arrayContaining(['send_message', 'delete_message']));
    expect(offeredTools.filter(({ description }) => !description?.trim()).map(({ name }) => name)).toEqual([]);
  }, 30_000);
});
