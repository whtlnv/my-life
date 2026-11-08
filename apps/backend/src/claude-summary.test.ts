import { describe, expect, it } from 'vitest';

import { createClaudeSummary } from './claude-summary';
import { readStartupSettings } from './startup-settings';

interface SentRequest {
  model: string;
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
        return Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-use-1', name: 'write_summary', input: { lines: ['GitHub: 2 builds'] } }],
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      },
    });

    await summary.summarize({ items: [{ summary: 'GitHub build passed' }] });

    expect(sentRequests.map(({ model }) => model)).toEqual(['claude-summary-model-from-settings']);
  });

  it('returns the summary lines the model wrote through its write_summary tool', async () => {
    const summary = createClaudeSummary({
      model: 'claude-haiku-5-5',
      pricing: { inputPerMillionTokensInUsd: 1, outputPerMillionTokensInUsd: 5 },
      createMessage: () =>
        Promise.resolve({
          content: [
            {
              type: 'tool_use',
              id: 'tool-use-1',
              name: 'write_summary',
              input: { lines: ['GitHub: 2 builds passed', 'Vercel: 1 deploy failed'] },
            },
          ],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
    });

    const written = await summary.summarize({
      items: [{ summary: 'GitHub build passed' }, { summary: 'Vercel deploy failed' }],
    });

    expect(written).toMatchObject({ lines: ['GitHub: 2 builds passed', 'Vercel: 1 deploy failed'] });
  });
});
