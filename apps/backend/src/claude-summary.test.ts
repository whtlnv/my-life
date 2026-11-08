import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createClaudeSummary } from './claude-summary';
import { readStartupSettings } from './startup-settings';

interface SentRequest {
  model: string;
}

function writeSummaryAnswer(input: unknown, usage = { input_tokens: 0, output_tokens: 0 }) {
  return Promise.resolve({
    content: [{ type: 'tool_use', id: 'tool-use-1', name: 'write_summary', input }],
    usage,
  });
}

describe('Claude summary', () => {
  it('asks the summary model set in config', async () => {
    const settings = readStartupSettings({ MY_LIFE_SUMMARY_MODEL: 'claude-summary-model-from-settings' }, '/Users/ana');
    const sentRequests: SentRequest[] = [];
    const summary = createClaudeSummary({
      model: settings.summaryModel,
      pricing: { inputPerMillionTokensInUsd: 1, outputPerMillionTokensInUsd: 5 },
      createMessage: (request: SentRequest) => {
        sentRequests.push(request);
        return writeSummaryAnswer({ lines: ['GitHub: 2 builds'] });
      },
    });

    await summary.summarize({ items: [{ summary: 'GitHub build passed' }] });

    expect(sentRequests.map(({ model }) => model)).toEqual(['claude-summary-model-from-settings']);
  });

  it('returns the summary lines the model wrote through its write_summary tool', async () => {
    const summary = createClaudeSummary({
      model: 'claude-haiku-5-5',
      pricing: { inputPerMillionTokensInUsd: 1, outputPerMillionTokensInUsd: 5 },
      createMessage: () => writeSummaryAnswer({ lines: ['GitHub: 2 builds passed', 'Vercel: 1 deploy failed'] }),
    });

    const written = await summary.summarize({
      items: [{ summary: 'GitHub build passed' }, { summary: 'Vercel deploy failed' }],
    });

    expect(written).toMatchObject({ lines: ['GitHub: 2 builds passed', 'Vercel: 1 deploy failed'] });
  });

  it('reports the cost of the call in USD from the input and output tokens the answer reports at their configured prices', async () => {
    const summary = createClaudeSummary({
      model: 'claude-haiku-5-5',
      pricing: { inputPerMillionTokensInUsd: 1, outputPerMillionTokensInUsd: 5 },
      createMessage: () =>
        writeSummaryAnswer({ lines: ['GitHub: 2 builds'] }, { input_tokens: 2_000_000, output_tokens: 400_000 }),
    });

    const written = await summary.summarize({ items: [{ summary: 'GitHub build passed' }] });

    expect(written).toMatchObject({ costInUsd: 4 });
  });

  it('fails the summary when the model writes more than two lines through its write_summary tool', async () => {
    const summary = createClaudeSummary({
      model: 'claude-haiku-5-5',
      pricing: { inputPerMillionTokensInUsd: 1, outputPerMillionTokensInUsd: 5 },
      createMessage: () =>
        writeSummaryAnswer({ lines: ['GitHub: 2 builds passed', 'Vercel: 1 deploy failed', 'Sentry: 3 new issues'] }),
    });

    await expect(
      summary.summarize({
        items: [{ summary: 'GitHub build passed' }, { summary: 'Vercel deploy failed' }, { summary: 'Sentry issue' }],
      }),
    ).rejects.toThrow();
  });

  it.each([
    { rule: 'no lines', input: { lines: [] } },
    { rule: 'an empty line', input: { lines: [''] } },
    { rule: 'a line that is not text', input: { lines: [42] } },
    { rule: 'no lines field', input: {} },
  ])('fails the summary when the model writes $rule through its write_summary tool', async ({ input }) => {
    const summary = createClaudeSummary({
      model: 'claude-haiku-5-5',
      pricing: { inputPerMillionTokensInUsd: 1, outputPerMillionTokensInUsd: 5 },
      createMessage: () => writeSummaryAnswer(input),
    });

    await expect(summary.summarize({ items: [{ summary: 'GitHub build passed' }] })).rejects.toThrow();
  });

  it('sends every item summary of the digest under the versioned prompt file and requires its write_summary tool', async () => {
    const promptPath = join(mkdtempSync(join(tmpdir(), 'my-life-prompts-')), 'digest-summary-v1.md');
    writeFileSync(promptPath, 'Summarize the digest in one or two lines by calling write_summary.');
    const sentRequests: {
      system?: string;
      tools?: { name: string }[];
      tool_choice?: unknown;
      messages?: { role: string; content: string }[];
    }[] = [];
    const summary = createClaudeSummary({
      model: 'claude-haiku-5-5',
      promptPath,
      pricing: { inputPerMillionTokensInUsd: 1, outputPerMillionTokensInUsd: 5 },
      createMessage: (request) => {
        sentRequests.push(request);
        return writeSummaryAnswer({ lines: ['GitHub: 2 builds'] });
      },
    });

    await summary.summarize({ items: [{ summary: 'GitHub build passed' }, { summary: 'Vercel deploy failed' }] });

    expect(sentRequests).toHaveLength(1);
    const [request] = sentRequests;
    expect(request?.system).toBe('Summarize the digest in one or two lines by calling write_summary.');
    expect(request?.tools?.map(({ name }) => name)).toEqual(['write_summary']);
    expect(request?.tool_choice).toEqual({ type: 'tool', name: 'write_summary' });
    const userContent = request?.messages?.map(({ content }) => content).join('\n') ?? '';
    expect(userContent).toContain('GitHub build passed');
    expect(userContent).toContain('Vercel deploy failed');
  });
});
