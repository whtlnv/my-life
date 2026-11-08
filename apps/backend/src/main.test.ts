// Drives the shipped composition (main.ts) as a process against a fake Anthropic server, so the wiring between the
// startup settings and the Claude adapters is pinned from the outside.

import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { budgetReviewReport, temporaryDatabasePath } from './app.test-support';

interface RecordedAnthropicRequest {
  model: string;
  tools: { name: string }[];
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

  it('writes digest summary lines with the Claude summary adapter on the configured summary model', async () => {
    const recorded: RecordedAnthropicRequest[] = [];
    fakeAnthropic = await startFakeAnthropic(recorded);
    const anthropicPort = (fakeAnthropic.address() as AddressInfo).port;
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
        MY_LIFE_TRIAGE_MODEL: 'claude-haiku-5-5',
        MY_LIFE_TRIAGE_ESCALATION_MODEL: 'none',
        MY_LIFE_SUMMARY_MODEL: 'claude-sonnet-5-5',
      },
      stdio: 'ignore',
    });
    await waitUntilHealthy(baseUrl);
    const [budgetReview] = budgetReviewReport.messages;
    await fetch(`${baseUrl}/mail-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...budgetReviewReport,
        messages: [
          { ...budgetReview, id: 'message-build', threadId: 'message-build', from: 'GitHub <noreply@github.com>' },
        ],
      }),
    });

    await fetch(`${baseUrl}/triage-run`, { method: 'POST' });

    const { digests } = (await (await fetch(`${baseUrl}/triage-queue`)).json()) as { digests: unknown[] };
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
    const anthropicPort = (fakeAnthropic.address() as AddressInfo).port;
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
        MY_LIFE_TRIAGE_MODEL: 'claude-haiku-5-5',
        MY_LIFE_TRIAGE_ESCALATION_MODEL: 'none',
        MY_LIFE_UNANSWERED_ASK_BUSINESS_DAYS: '1',
      },
      stdio: 'ignore',
    });
    await waitUntilHealthy(baseUrl);
    const askedAt = oneBusinessDayAgo().toISOString();
    const [budgetReview] = budgetReviewReport.messages;
    await fetch(`${baseUrl}/mail-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...budgetReviewReport, messages: [{ ...budgetReview, date: askedAt }] }),
    });
    await fetch(`${baseUrl}/triage-run`, { method: 'POST' });

    const { urgent } = (await (await fetch(`${baseUrl}/people`)).json()) as {
      urgent: { emails: string[]; reasons: string[] }[];
    };

    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['unanswered ask'] })]);
  }, 30_000);
});
