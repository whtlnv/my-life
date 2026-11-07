import { describe, expect, it } from 'vitest';

import { createClaudeTriage } from './claude-triage';
import { readStartupSettings } from './startup-settings';

describe('Claude triage', () => {
  it('sends a triage request with the model id from settings', async () => {
    const settings = readStartupSettings({ MY_LIFE_TRIAGE_MODEL: 'claude-model-from-settings' }, '/Users/ana');
    const sentRequests: { model: string }[] = [];
    const triage = createClaudeTriage({
      model: settings.triageModel,
      createMessage: async (request: { model: string }) => {
        sentRequests.push(request);
        return { content: [], usage: { input_tokens: 0, output_tokens: 0 } };
      },
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z' });

    expect(sentRequests.map((request) => request.model)).toEqual(['claude-model-from-settings']);
  });
});
