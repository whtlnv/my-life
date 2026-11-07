import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  it('sends the prompt read from the versioned prompt file and reports that file\'s version', async () => {
    const promptPath = join(mkdtempSync(join(tmpdir(), 'my-life-prompts-')), 'triage-v7.md');
    writeFileSync(promptPath, 'Classify this email for Ana.');
    const sentRequests: { model: string; system?: string }[] = [];
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      promptPath,
      createMessage: async (request: { model: string; system?: string }) => {
        sentRequests.push(request);
        return { content: [], usage: { input_tokens: 0, output_tokens: 0 } };
      },
    });

    const result = await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z' });

    expect({ system: sentRequests[0]?.system, promptVersion: result?.promptVersion }).toEqual({
      system: 'Classify this email for Ana.',
      promptVersion: 'triage-v7',
    });
  });

  it("sends the account's profile text read from the profile directory", async () => {
    const promptPath = join(mkdtempSync(join(tmpdir(), 'my-life-prompts-')), 'triage-v1.md');
    writeFileSync(promptPath, 'Classify this email.');
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    writeFileSync(join(profileDirectory, 'acme.md'), 'Ana runs the Acme sales team; invoices always matter.');
    const sentRequests: { model: string; system?: string }[] = [];
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      promptPath,
      profileDirectory,
      createMessage: async (request: { model: string; system?: string }) => {
        sentRequests.push(request);
        return { content: [], usage: { input_tokens: 0, output_tokens: 0 } };
      },
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z', accountEmail: 'ana@acme.com' });

    expect(sentRequests[0]?.system).toContain('Ana runs the Acme sales team; invoices always matter.');
  });
});
