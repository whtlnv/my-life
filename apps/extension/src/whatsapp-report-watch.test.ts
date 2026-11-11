// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FetchFunction } from './fetch-function';
import { parseWhatsappPage } from './whatsapp-page-parser';
import { watchWhatsappPage } from './whatsapp-report-watch';

const backendUrl = 'http://127.0.0.1:7777';

const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');

function recordingBackend(postedReports: unknown[]): FetchFunction {
  return (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === `${backendUrl}/chat-messages` && init?.method === 'POST') {
      postedReports.push(JSON.parse(init.body as string));
      return Promise.resolve(Response.json({ ok: true }));
    }
    return Promise.resolve(new Response('unexpected request', { status: 404 }));
  };
}

function watchOneToOneChatFixture() {
  const document = fixtureDocument('whatsapp-one-to-one-chat.fixture.html');
  const postedReports: unknown[] = [];
  watchWhatsappPage({
    fetch: recordingBackend(postedReports),
    accountEmail: 'francisco@example.com',
    backendUrl,
    document,
  });
  return { document, postedReports };
}

async function mutate(document: Document) {
  document.body.append(document.createElement('div'));
  await Promise.resolve();
}

describe('watchWhatsappPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts one report, 10 s after the last of several DOM mutations within 10 s', async () => {
    const { document, postedReports } = watchOneToOneChatFixture();

    await mutate(document);
    await vi.advanceTimersByTimeAsync(4_000);
    await mutate(document);
    await vi.advanceTimersByTimeAsync(4_000);
    await mutate(document);
    await vi.advanceTimersByTimeAsync(9_999);
    const postedBeforeQuietPeriodEnds = postedReports.length;
    await vi.advanceTimersByTimeAsync(1);

    expect(postedBeforeQuietPeriodEnds).toBe(0);
    expect(postedReports).toEqual([
      expect.objectContaining({ channel: 'whatsapp', accountEmail: 'francisco@example.com' }),
    ]);
  });

  it('posts two reports for two DOM mutations more than 10 s apart', async () => {
    const { document, postedReports } = watchOneToOneChatFixture();

    await mutate(document);
    await vi.advanceTimersByTimeAsync(10_001);
    await mutate(document);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(postedReports).toEqual([
      expect.objectContaining({ channel: 'whatsapp', accountEmail: 'francisco@example.com' }),
      expect.objectContaining({ channel: 'whatsapp', accountEmail: 'francisco@example.com' }),
    ]);
  });

  it('posts the parser failure instead of a report when the parse fails', async () => {
    const document = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const postedReports: unknown[] = [];
    watchWhatsappPage({
      fetch: recordingBackend(postedReports),
      accountEmail: 'francisco@example.com',
      backendUrl,
      document,
    });

    await mutate(document);
    await vi.advanceTimersByTimeAsync(10_000);

    const parserFailure = parseWhatsappPage(document);
    expect(parserFailure.ok).toBe(false);
    expect(postedReports).toEqual([{ ...parserFailure, channel: 'whatsapp', accountEmail: 'francisco@example.com' }]);
  });
});
